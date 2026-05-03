import { useState, useRef, useCallback } from "react";
import { apiUrl } from "../apiRoot.js";

const VOICE_TOOLS = [];

const VOICE_INSTRUCTIONS = `
Du bist der freundliche deutschsprachige Voice-Assistent von MisterWatch (misterwatches.store).
Sprich warm, kurz und natürlich — maximal zwei kurze Sätze pro Antwort, keine Listen, kein Markdown.
Nutze nur Fakten, die dir der Kontext liefert; nichts erfinden. Bei Unklarheit höflich nachfragen.
`;

/* ─────────────────────────────────────────────────────────────────────────
   AUDIO HELPERS
───────────────────────────────────────────────────────────────────────── */

function floatTo16BitPCM(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return window.btoa(bin);
}

function base64ToFloat32(base64) {
  const bin   = window.atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const int16   = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
  return float32;
}

/* ─────────────────────────────────────────────────────────────────────────
   HOOK
───────────────────────────────────────────────────────────────────────── */

export function useMisterWatchVoiceAgent({ fetchChatReply }) {
  const [status,          setStatus]          = useState("idle");
  const [userTranscript,  setUserTranscript]  = useState("");
  const [agentTranscript, setAgentTranscript] = useState("");
  const [error,           setError]           = useState(null);

  /* audio / WebSocket refs */
  const wsRef              = useRef(null);
  const audioCtxRef        = useRef(null);
  const processorRef       = useRef(null);
  const streamRef          = useRef(null);
  const nextPlayTimeRef    = useRef(0);
  const audioItemIdRef     = useRef(null);   // current response audio item id (for truncation)
  const isMutedRef         = useRef(false);
  const toolCallBufferRef  = useRef({});
  const browserAbortRef    = useRef(false);
  const browserRecRef      = useRef(null);
  /** True while assistant has an in-flight streamed response (audio/text). */
  const agentResponseActiveRef = useRef(false);
  /** Bumped on cleanup and on each new WS — stale handlers ignore onclose/onerror. */
  const voiceGenRef            = useRef(0);

  /* ── Play PCM16 audio chunk ───────────────────────────────── */
  const playChunk = useCallback((base64Audio) => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const float32 = base64ToFloat32(base64Audio);
      const buf  = ctx.createBuffer(1, float32.length, 24000);
      buf.copyToChannel(float32, 0);
      const src  = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      const now   = ctx.currentTime;
      const start = Math.max(now, nextPlayTimeRef.current);
      src.start(start);
      nextPlayTimeRef.current = start + buf.duration;
    } catch (e) {
      console.warn("[voice] playChunk:", e?.message || e);
    }
  }, []);

  /* ── Interrupt: stop audio queue immediately ──────────────── */
  const interruptPlayback = useCallback(() => {
    if (!audioCtxRef.current) return;
    // Reset scheduled play time to "right now" — future chunks won't play
    nextPlayTimeRef.current = audioCtxRef.current.currentTime;
  }, []);

  /* ── Send tool result back to Realtime API ────────────────── */
  const sendToolResult = useCallback((callId, result) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type:    "function_call_output",
        call_id: callId,
        output:  JSON.stringify(result),
      },
    }));
    wsRef.current.send(JSON.stringify({ type: "response.create" }));
  }, []);

  const executeToolCall = useCallback(async (callId, name, argsStr) => {
    try {
      const res = await fetch(apiUrl("/api/voice/execute-tool"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, arguments: argsStr, token: null }),
      });
      const data = await res.json();
      sendToolResult(callId, data.result ?? data);
    } catch {
      sendToolResult(callId, { error: "Tool execution failed" });
    }
  }, [sendToolResult]);

  /* ── WebSocket message handler ────────────────────────────── */
  const handleMessage = useCallback((raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const t = msg.type;

    switch (t) {

      /* Track which audio item is currently playing (needed for truncation) */
      case "response.output_item.added":
        if (msg.item?.type === "message") {
          audioItemIdRef.current = msg.item.id;
        }
        break;

      /* User started speaking — INTERRUPT agent if it's talking */
      case "input_audio_buffer.speech_started":
        setStatus("listening");
        setAgentTranscript("");
        interruptPlayback();
        /* Only cancel an active assistant turn — cancel+truncate(0) on noise breaks the session. */
        if (wsRef.current?.readyState === WebSocket.OPEN && agentResponseActiveRef.current) {
          try {
            wsRef.current.send(JSON.stringify({ type: "response.cancel" }));
          } catch {
            /* ignore */
          }
        }
        break;

      case "input_audio_buffer.speech_stopped":
        setStatus("thinking");
        break;

      case "response.created":
        agentResponseActiveRef.current = true;
        setStatus("speaking");
        break;

      case "response.audio.delta":
      case "response.output_audio.delta":
        if (msg.delta) playChunk(msg.delta);
        break;

      case "response.audio_transcript.delta":
      case "response.output_audio_transcript.delta":
        if (msg.delta) setAgentTranscript((prev) => prev + msg.delta);
        break;

      case "conversation.item.input_audio_transcription.completed":
        setUserTranscript(msg.transcript || "");
        break;

      /* Tool call — accumulate args across delta events */
      case "response.function_call_arguments.delta": {
        const { call_id, delta } = msg;
        toolCallBufferRef.current[call_id] =
          (toolCallBufferRef.current[call_id] || "") + (delta || "");
        break;
      }
      case "response.function_call_arguments.done": {
        const { call_id, name, arguments: argsStr } = msg;
        const finalArgs = argsStr || toolCallBufferRef.current[call_id] || "{}";
        delete toolCallBufferRef.current[call_id];
        executeToolCall(call_id, name, finalArgs);
        break;
      }

      case "response.done":
        agentResponseActiveRef.current = false;
        setStatus("listening");
        setUserTranscript("");
        audioItemIdRef.current = null;
        break;

      case "response.cancelled":
      case "response.failed":
        agentResponseActiveRef.current = false;
        break;

      case "error": {
        const err = msg.error;
        const code = err && typeof err === "object" ? err.code : null;
        /* Benign / recoverable — do not tear down the whole widget. */
        const benign =
          code === "input_audio_buffer_commit_empty" ||
          code === "conversation_already_has_active_response" ||
          (typeof err?.message === "string" &&
            /no active response|already has an active response|nothing to cancel/i.test(err.message));
        if (benign) {
          console.warn("Realtime WS (non-fatal):", err);
          break;
        }
        const detail =
          typeof err?.message === "string"
            ? err.message
            : typeof err === "string"
              ? err
              : err && typeof err === "object"
                ? JSON.stringify(err)
                : "Voice agent error";
        console.error("Realtime WS error:", err);
        agentResponseActiveRef.current = false;
        setError(detail);
        setStatus("error");
        break;
      }

      default:
        break;
    }
  }, [playChunk, interruptPlayback, executeToolCall]);

  /* ── Cleanup everything ───────────────────────────────────── */
  const cleanup = useCallback(() => {
    voiceGenRef.current += 1;
    agentResponseActiveRef.current = false;
    browserAbortRef.current = true;
    try {
      browserRecRef.current?.stop?.();
    } catch {
      /* ignore */
    }
    browserRecRef.current = null;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    processorRef.current?.disconnect();
    processorRef.current = null;

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    if (wsRef.current) {
      try {
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current       = null;
    nextPlayTimeRef.current   = 0;
    audioItemIdRef.current    = null;
    toolCallBufferRef.current = {};
    isMutedRef.current        = false;
  }, []);

  const runBrowserVoiceSession = useCallback(async (replyFn) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Spracheingabe wird in diesem Browser nicht unterstützt.");
      setStatus("error");
      return;
    }
    browserAbortRef.current = false;
    await new Promise((r) => setTimeout(r, 450));
    if (browserAbortRef.current) return;
    while (!browserAbortRef.current) {
      setStatus("listening");
      setUserTranscript("");
      setAgentTranscript("");
      // eslint-disable-next-line no-await-in-loop
      const text = await new Promise((resolve) => {
        const rec = new SR();
        browserRecRef.current = rec;
        let settled = false;
        rec.lang = "de-DE";
        rec.continuous = false;
        rec.interimResults = false;
        rec.onresult = (event) => {
          let t = "";
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            if (event.results[i].isFinal) t += event.results[i][0].transcript;
          }
          const s = t.trim();
          if (s && !settled) {
            settled = true;
            try {
              rec.stop();
            } catch {
              /* ignore */
            }
            resolve(s);
          }
        };
        rec.onerror = (ev) => {
          if (!settled) {
            settled = true;
            resolve(ev.error === "no-speech" || ev.error === "aborted" ? "" : "__ERR__");
          }
        };
        rec.onend = () => {
          if (!settled) {
            settled = true;
            resolve("");
          }
        };
        try {
          rec.start();
        } catch {
          if (!settled) {
            settled = true;
            resolve("");
          }
        }
      });
      browserRecRef.current = null;
      if (browserAbortRef.current) break;
      if (text === "__ERR__") continue;
      if (!String(text || "").trim()) continue;
      if (isMutedRef.current) continue;
      setUserTranscript(text);
      setStatus("thinking");
      let reply = "";
      try {
        reply = await replyFn(text);
      } catch {
        reply = "Verbindungsfehler. Bitte gleich noch einmal versuchen.";
      }
      if (browserAbortRef.current) break;
      const plain = String(reply)
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/#{1,6}\s?/gm, "")
        .replace(/[*_`]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 4000);
      setAgentTranscript(plain);
      setStatus("speaking");
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        if (typeof window === "undefined" || !window.speechSynthesis || isMutedRef.current) {
          setTimeout(resolve, 1400);
          return;
        }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(plain);
        u.lang = "de-DE";
        u.onend = resolve;
        u.onerror = resolve;
        window.speechSynthesis.speak(u);
      });
      if (browserAbortRef.current) break;
      setUserTranscript("");
      setAgentTranscript("");
    }
    browserRecRef.current = null;
    if (!browserAbortRef.current) setStatus("idle");
  }, []);

  /* ── START voice agent ────────────────────────────────────── */
  const start = useCallback(async () => {
    try {
      voiceGenRef.current += 1;
      const voiceSid = voiceGenRef.current;
      agentResponseActiveRef.current = false;
      setStatus("connecting");
      setError(null);
      setUserTranscript("");
      setAgentTranscript("");

      /* 1. Ephemeral key from backend (keeps real API key hidden) */
      const res = await fetch(apiUrl("/api/voice/session"), { method: "POST" });
      if (!res.ok) {
        await runBrowserVoiceSession(fetchChatReply);
        return;
      }
      const sessionJson = await res.json();
      const {
        ephemeralKey,
        error: sessionError,
        model: modelFromServer,
        clientSession,
        sessionConfiguredAtMint,
      } = sessionJson;
      if (sessionError) throw new Error(JSON.stringify(sessionError));
      const configuredAtMint = Boolean(sessionConfiguredAtMint);

      const realtimeModel =
        typeof modelFromServer === "string" && modelFromServer.trim()
          ? modelFromServer.trim()
          : "gpt-4o-realtime-preview-2024-12-17";
      /** Preview models use the beta WebSocket subprotocol; newer GA models often omit it. */
      const useBetaRealtimeSubprotocol = /preview/i.test(realtimeModel);

      /* 2. AudioContext at 24 kHz (Realtime API requirement) */
      audioCtxRef.current     = new AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = 0;
      try {
        if (audioCtxRef.current.state === "suspended") {
          await audioCtxRef.current.resume();
        }
      } catch {
        /* ignore */
      }

      /* 3. Mic capture — full quality constraints for noise/echo suppression */
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: { ideal: 24000 },
          },
        });
      } catch (micErr) {
        if (micErr.name === "NotAllowedError" || micErr.name === "PermissionDeniedError") {
          throw new Error("Microphone access denied. Please allow mic permission in your browser and try again.");
        }
        throw new Error("Could not access microphone: " + micErr.message);
      }
      streamRef.current = stream;

      /* Processor buffer size = 2048 (≈85ms at 24kHz) — low latency */
      const micSource  = audioCtxRef.current.createMediaStreamSource(stream);
      const processor  = audioCtxRef.current.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      /* Silent gain node — processor must be in graph to fire onaudioprocess */
      const silent = audioCtxRef.current.createGain();
      silent.gain.value = 0;
      micSource.connect(processor);
      processor.connect(silent);
      silent.connect(audioCtxRef.current.destination);

      /* 4. Open WebSocket to OpenAI Realtime API (model must match minted session) */
      const wsProtocols = [
        "realtime",
        `openai-insecure-api-key.${ephemeralKey}`,
      ];
      if (useBetaRealtimeSubprotocol) {
        wsProtocols.push("openai-beta.realtime-v1");
      }
      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(realtimeModel)}`,
        wsProtocols
      );
      wsRef.current = ws;

      ws.onopen = () => {
        if (voiceSid !== voiceGenRef.current) return;
        const serverSession =
          clientSession && typeof clientSession === "object" && !Array.isArray(clientSession)
            ? clientSession
            : null;
        if (!configuredAtMint) {
          const sessionPayload = serverSession
            ? serverSession
            : {
                modalities: ["text", "audio"],
                instructions: VOICE_INSTRUCTIONS,
                voice: "echo",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                input_audio_transcription: { model: "whisper-1", language: "de" },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.45,
                  prefix_padding_ms: 200,
                  silence_duration_ms: 600,
                },
                tools: VOICE_TOOLS,
                tool_choice: VOICE_TOOLS.length ? "auto" : "none",
                temperature: 0.8,
                max_response_output_tokens: 150,
              };
          ws.send(JSON.stringify({
            type: "session.update",
            session: sessionPayload,
          }));
        }

        /* Warm greeting kick-off (after session.update when used, same order as voiceagent frontend) */
        ws.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            instructions:
              "Begrüße den Nutzer in einem kurzen, freundlichen Satz auf Deutsch. Du bist der Voice-Assistent von MisterWatch und hilfst bei Uhren und dem Shop misterwatches.store.",
          },
        }));

        setStatus("listening");
      };

      ws.onmessage = (e) => handleMessage(e.data);

      ws.onerror = () => {
        if (voiceSid !== voiceGenRef.current) return;
        setError("Connection to voice service failed. Please try again.");
        setStatus("error");
        cleanup();
      };

      ws.onclose = (e) => {
        if (voiceSid !== voiceGenRef.current) return;
        const okCode = e.code === 1000 || e.code === 1001;
        /* 1005 = no close frame (browser / script close). */
        if (!okCode && e.code !== 1005) {
          const reason = typeof e.reason === "string" && e.reason.trim() ? `: ${e.reason.trim()}` : "";
          setError(`Voice-Verbindung getrennt (Code ${e.code})${reason}`);
        }
        agentResponseActiveRef.current = false;
        setStatus("idle");
      };

      /* 5. Stream mic audio to Realtime API */
      processor.onaudioprocess = (e) => {
        if (
          wsRef.current?.readyState !== WebSocket.OPEN ||
          isMutedRef.current
        ) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const pcm16   = floatTo16BitPCM(float32);
        const b64     = arrayBufferToBase64(pcm16.buffer);
        wsRef.current.send(JSON.stringify({
          type:  "input_audio_buffer.append",
          audio: b64,
        }));
      };

    } catch (err) {
      console.error("Voice start error:", err);
      setError(err.message || "Failed to start voice agent.");
      setStatus("error");
      cleanup();
    }
  }, [handleMessage, cleanup, runBrowserVoiceSession, fetchChatReply]);

  /* ── STOP voice agent ─────────────────────────────────────── */
  const stop = useCallback(() => {
    cleanup();
    setStatus("idle");
    setUserTranscript("");
    setAgentTranscript("");
    setError(null);
  }, [cleanup]);

  /* ── MUTE / unmute mic ────────────────────────────────────── */
  const toggleMute = useCallback(() => {
    isMutedRef.current = !isMutedRef.current;
    streamRef.current?.getTracks().forEach((t) => {
      t.enabled = !isMutedRef.current;
    });
    return isMutedRef.current;
  }, []);

  return { status, userTranscript, agentTranscript, error, start, stop, toggleMute };
}
