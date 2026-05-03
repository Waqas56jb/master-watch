import { useState, useRef, useCallback } from "react";

/** Same origin rules as chat widget (`App.jsx` / `getChatUrl`). */
function voiceApi(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  let o = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
  if (import.meta.env.DEV && typeof window !== "undefined" && o) {
    try {
      if (new URL(o).origin === window.location.origin) o = "";
    } catch {
      o = "";
    }
  }
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    const loop = h === "localhost" || h === "127.0.0.1" || h === "::1";
    if (loop) {
      const port = String(window.location.port || "");
      if (port === "5173" || port === "3000") o = "";
    }
  }
  return o ? `${o}${p}` : p;
}

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

  /* ── Play PCM16 audio chunk ───────────────────────────────── */
  const playChunk = useCallback((base64Audio) => {
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
      const res = await fetch(voiceApi("/api/voice/execute-tool"), {
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
    const msg = JSON.parse(raw);

    switch (msg.type) {

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
        // Tell server to cancel current response mid-generation
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "response.cancel" }));
          // Truncate so server knows how much audio the user actually heard
          if (audioItemIdRef.current) {
            wsRef.current.send(JSON.stringify({
              type:          "conversation.item.truncate",
              item_id:       audioItemIdRef.current,
              content_index: 0,
              audio_end_ms:  0,
            }));
            audioItemIdRef.current = null;
          }
        }
        break;

      case "input_audio_buffer.speech_stopped":
        setStatus("thinking");
        break;

      case "response.created":
        setStatus("speaking");
        break;

      case "response.audio.delta":
        if (msg.delta) playChunk(msg.delta);
        break;

      case "response.audio_transcript.delta":
        if (msg.delta) setAgentTranscript(prev => prev + msg.delta);
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
        setStatus("listening");
        setUserTranscript("");
        audioItemIdRef.current = null;
        break;

      case "error":
        console.error("Realtime WS error:", msg.error);
        setError(msg.error?.message || "Voice agent error");
        setStatus("error");
        break;

      default:
        break;
    }
  }, [playChunk, interruptPlayback, executeToolCall]);

  /* ── Cleanup everything ───────────────────────────────────── */
  const cleanup = useCallback(() => {
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
      wsRef.current.onclose = null;
      wsRef.current.close();
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
      setStatus("connecting");
      setError(null);
      setUserTranscript("");
      setAgentTranscript("");

      /* 1. Ephemeral key from backend (keeps real API key hidden) */
      const res = await fetch(voiceApi("/api/voice/session"), { method: "POST" });
      if (!res.ok) {
        await runBrowserVoiceSession(fetchChatReply);
        return;
      }
      const sessionJson = await res.json();
      const {
        ephemeralKey,
        error: sessionError,
        model: modelFromServer,
        sessionConfiguredAtMint,
      } = sessionJson;
      if (sessionError) throw new Error(JSON.stringify(sessionError));

      const realtimeModel =
        typeof modelFromServer === "string" && modelFromServer.trim()
          ? modelFromServer.trim()
          : "gpt-4o-realtime-preview-2024-12-17";
      const skipClientSessionUpdate = Boolean(sessionConfiguredAtMint);

      /* 2. AudioContext at 24 kHz (Realtime API requirement) */
      audioCtxRef.current     = new AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = 0;

      /* 3. Mic capture — full quality constraints for noise/echo suppression */
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation:  true,
            noiseSuppression:  true,
            autoGainControl:   true,
            sampleRate:        24000,
            channelCount:      1,
            latency:           0,            // request lowest possible latency
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
      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(realtimeModel)}`,
        [
          "realtime",
          `openai-insecure-api-key.${ephemeralKey}`,
          "openai-beta.realtime-v1",
        ]
      );
      wsRef.current = ws;

      ws.onopen = () => {
        /* Backend mints session with DB prompts + German + pcm16; avoid overwriting with empty tools. */
        if (!skipClientSessionUpdate) {
          ws.send(JSON.stringify({
            type: "session.update",
            session: {
              modalities:          ["text", "audio"],
              instructions:        VOICE_INSTRUCTIONS,
              voice:               "echo",
              input_audio_format:  "pcm16",
              output_audio_format: "pcm16",
              input_audio_transcription: { model: "whisper-1", language: "de" },
              turn_detection: {
                type:                 "server_vad",
                threshold:            0.45,
                prefix_padding_ms:    200,
                silence_duration_ms:  600,
              },
              tools:       VOICE_TOOLS,
              tool_choice: VOICE_TOOLS.length ? "auto" : "none",
              temperature: 0.8,
              max_response_output_tokens: 150,
            },
          }));
        }

        /* Warm greeting kick-off */
        ws.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities:   ["audio", "text"],
            instructions:
              "Begrüße den Nutzer in einem kurzen, freundlichen Satz auf Deutsch. Du bist der Voice-Assistent von MisterWatch und hilfst bei Uhren und dem Shop misterwatches.store.",
          },
        }));

        setStatus("listening");
      };

      ws.onmessage = (e) => handleMessage(e.data);

      ws.onerror = () => {
        setError("Connection to voice service failed. Please try again.");
        setStatus("error");
        cleanup();
      };

      ws.onclose = (e) => {
        // 1000 = normal close, 1001 = going away — don't treat as error
        if (e.code !== 1000 && e.code !== 1001) {
          setError(`Voice session ended unexpectedly (code ${e.code}).`);
        }
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
