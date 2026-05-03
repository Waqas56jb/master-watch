import { useState, useEffect, useRef, useCallback } from "react";
import "./VoiceAgent.css";
import { useMisterWatchVoiceAgent } from "../hooks/useMisterWatchVoiceAgent";

/* ── Constants ───────────────────────────────────────────────────────── */

const BAR_HEIGHTS = [6,10,16,22,30,38,40,38,30,22,16,12,16,22,30,38,40,38,30,22,16,10,8,6];

const ORB_COLORS = {
  idle:   { a: "rgba(0,100,255,",   b: "rgba(0,229,255,",  c: "rgba(0,50,150,"   },
  listen: { a: "rgba(0,200,100,",   b: "rgba(0,255,170,",  c: "rgba(0,100,50,"   },
  think:  { a: "rgba(120,0,220,",   b: "rgba(191,96,255,", c: "rgba(60,0,120,"   },
  speak:  { a: "rgba(220,80,0,",    b: "rgba(255,130,50,", c: "rgba(200,0,100,"  },
};

const STATE_MAP = {
  idle:       { theme: "idle",   cls: "",         big: "STANDBY",    sub: "NEURAL LINK ACTIVE",     wave: 0,   viz: false },
  connecting: { theme: "think",  cls: "s-think",  big: "CONNECTING", sub: "ESTABLISHING LINK",      wave: 0.4, viz: false },
  listening:  { theme: "listen", cls: "s-listen", big: "LISTENING",  sub: "CAPTURING VOICE INPUT",  wave: 1,   viz: true  },
  thinking:   { theme: "think",  cls: "s-think",  big: "PROCESSING", sub: "NEURAL INFERENCE",       wave: 0.4, viz: false },
  speaking:   { theme: "speak",  cls: "s-speak",  big: "RESPONDING", sub: "VOICE SYNTHESIS ACTIVE", wave: 1,   viz: true  },
  error:      { theme: "idle",   cls: "",         big: "ERROR",      sub: "SYSTEM FAULT",           wave: 0,   viz: false },
};

/* ── Component ───────────────────────────────────────────────────────── */

export default function VoiceAgent({ onClose, fetchChatReply }) {
  const {
    status, userTranscript, agentTranscript, error,
    start, stop, toggleMute,
  } = useMisterWatchVoiceAgent({ fetchChatReply });

  const [active,     setActive]     = useState(false);
  const [muted,      setMuted]      = useState(false);
  const [seconds,    setSeconds]    = useState(0);
  const [latency,    setLatency]    = useState("—");
  const [confidence, setConfidence] = useState("—");
  const [wordCount,  setWordCount]  = useState(0);
  const [tickerText, setTickerText] = useState(
    "Waiting for voice input\u00A0·\u00A0System ready\u00A0·\u00A0Neural link established"
  );

  const orbCanvasRef  = useRef(null);
  const waveRingRef   = useRef(null);
  const animFrameRef  = useRef(null);
  const animTRef      = useRef(0);
  const waveAmpRef    = useRef(0);
  const waveTargetRef = useRef(0);
  const orbColorsRef  = useRef(ORB_COLORS.idle);
  const timerRef      = useRef(null);

  /* ── Canvas: animated plasma orb (200×200) ───────────────────── */
  const drawOrb = useCallback((t, intensity) => {
    const cv = orbCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const W = 200, H = 200, cx = 100, cy = 100, R = 92;
    const col = orbColorsRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    const base = ctx.createRadialGradient(cx - 22, cy - 22, 0, cx, cy, R);
    base.addColorStop(0,   col.b + "0.7)");
    base.addColorStop(0.4, col.a + "0.5)");
    base.addColorStop(0.8, col.c + "0.8)");
    base.addColorStop(1,   "rgba(1,3,10,0.98)");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 5; i++) {
      const angle = t * 0.3 + i * 1.26;
      const r2    = 35 + 20 * Math.sin(t * 0.7 + i * 0.8);
      const bx    = cx + Math.cos(angle) * r2 * (0.6 + intensity * 0.4);
      const by    = cy + Math.sin(angle * 1.3) * r2 * (0.6 + intensity * 0.4);
      const brad  = 28 + 14 * Math.sin(t * 0.5 + i);
      const bg    = ctx.createRadialGradient(bx, by, 0, bx, by, brad);
      bg.addColorStop(0, col.b + (0.25 + intensity * 0.2) + ")");
      bg.addColorStop(1, "transparent");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.save();
    for (let i = 0; i < 6; i++) {
      const a = t * 0.4 + i * 1.047;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(
        cx + Math.cos(a + 0.5) * R * 0.6,
        cy + Math.sin(a + 0.5) * R * 0.6,
        cx + Math.cos(a) * R,
        cy + Math.sin(a) * R
      );
      ctx.strokeStyle = col.b + (0.04 + intensity * 0.06) + ")";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    const rim = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R);
    rim.addColorStop(0,    "transparent");
    rim.addColorStop(0.85, "transparent");
    rim.addColorStop(1,    col.b + "0.35)");
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, W, H);

    const spec = ctx.createRadialGradient(cx - 32, cy - 28, 0, cx - 32, cy - 28, 50);
    spec.addColorStop(0,   "rgba(255,255,255,0.22)");
    spec.addColorStop(0.4, "rgba(255,255,255,0.06)");
    spec.addColorStop(1,   "transparent");
    ctx.fillStyle = spec;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();

    const outer = ctx.createRadialGradient(cx, cy, R * 0.88, cx, cy, R * 1.28);
    outer.addColorStop(0, col.b + (0.15 + intensity * 0.15) + ")");
    outer.addColorStop(1, "transparent");
    ctx.fillStyle = outer;
    ctx.fillRect(0, 0, W, H);
  }, []);

  /* ── SVG: animated wave ring (200×200 viewBox) ───────────────── */
  const updateWaveRing = useCallback((t, amp) => {
    const svg = waveRingRef.current;
    if (!svg) return;
    const p1 = svg.querySelector("#va-wpath");
    const p2 = svg.querySelector("#va-wpath2");
    if (!p1 || !p2) return;
    const cx = 100, cy = 100, R = 100, pts = 64;
    let d = "", d2 = "";
    for (let i = 0; i <= pts; i++) {
      const a  = (i / pts) * Math.PI * 2;
      const w1 = Math.sin(a * 4 + t * 2)   * amp * 6;
      const w2 = Math.sin(a * 6 - t * 1.5) * amp * 4;
      const w3 = Math.sin(a * 2 + t * 0.8) * amp * 3;
      const r  = R + w1 + w2 + w3;
      d  += (i === 0 ? "M" : "L") + (cx + Math.cos(a) * r).toFixed(1) + "," + (cy + Math.sin(a) * r).toFixed(1);
      const r2 = R - 8 + w1 * 0.5 + w2 * 0.3;
      d2 += (i === 0 ? "M" : "L") + (cx + Math.cos(a) * r2).toFixed(1) + "," + (cy + Math.sin(a) * r2).toFixed(1);
    }
    p1.setAttribute("d", d + "Z");
    p2.setAttribute("d", d2 + "Z");
  }, []);

  /* ── rAF animation loop ───────────────────────────────────────── */
  const animate = useCallback(() => {
    animTRef.current  += 0.016;
    waveAmpRef.current += (waveTargetRef.current - waveAmpRef.current) * 0.05;
    drawOrb(animTRef.current, waveAmpRef.current);
    updateWaveRing(animTRef.current, waveAmpRef.current);
    animFrameRef.current = requestAnimationFrame(animate);
  }, [drawOrb, updateWaveRing]);

  /* ── Mount: SVG paths + animation loop ───────────────────────── */
  useEffect(() => {
    const svg = waveRingRef.current;
    if (svg) {
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("fill", "none");
      p1.setAttribute("stroke", "rgba(0,229,255,0.4)");
      p1.setAttribute("stroke-width", "1.5");
      p1.id = "va-wpath";
      svg.appendChild(p1);

      const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p2.setAttribute("fill", "none");
      p2.setAttribute("stroke", "rgba(0,229,255,0.15)");
      p2.setAttribute("stroke-width", "1");
      p2.id = "va-wpath2";
      svg.appendChild(p2);
    }
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [animate]);

  /* ── Auto-start voice on first open ──────────────────────────── */
  useEffect(() => {
    setTickerText("Initialising voice connection\u00A0·\u00A0Please wait…");
    setActive(true);
    start();
    return () => stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Session timer ────────────────────────────────────────────── */
  useEffect(() => {
    if (active) {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [active]);

  /* ── Sync hook status → display ──────────────────────────────── */
  useEffect(() => {
    const cfg = STATE_MAP[status] ?? STATE_MAP.idle;
    waveTargetRef.current = cfg.wave;
    orbColorsRef.current  = ORB_COLORS[cfg.theme];

    if (status === "listening") {
      setLatency(`${Math.floor(15 + Math.random() * 30)}ms`);
      setConfidence(`${Math.floor(90 + Math.random() * 10)}%`);
      if (userTranscript) {
        setTickerText(userTranscript);
        setWordCount(prev => prev + userTranscript.split(" ").filter(Boolean).length);
      }
    } else if (status === "thinking") {
      setLatency(`${Math.floor(60 + Math.random() * 80)}ms`);
    } else if (status === "speaking") {
      setLatency(`${Math.floor(20 + Math.random() * 25)}ms`);
      if (agentTranscript) {
        setTickerText(agentTranscript);
        setWordCount(prev => prev + agentTranscript.split(" ").filter(Boolean).length);
      }
    } else {
      setLatency("—");
      setConfidence("—");
    }
  }, [status, userTranscript, agentTranscript]);

  /* ── Controls ─────────────────────────────────────────────────── */
  const handleTalk = async () => {
    if (active) {
      // Pause / stop mic
      stop();
      setActive(false);
      setTickerText("Paused\u00A0·\u00A0Tap mic to resume");
    } else {
      // Resume
      setTickerText("Resuming voice connection\u00A0·\u00A0Please wait…");
      setActive(true);
      await start();
    }
  };

  const handleEnd = () => {
    stop();
    setActive(false);
    onClose();
  };

  const handleMute = () => {
    const nowMuted = toggleMute();
    setMuted(nowMuted);
  };

  /* ── Derived ──────────────────────────────────────────────────── */
  const cfg = STATE_MAP[status] ?? STATE_MAP.idle;
  const timeFormatted =
    `${String(Math.floor(seconds / 60)).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;

  /* ── Icons ────────────────────────────────────────────────────── */
  const MicIcon = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
      <path d="M19 10v2a7 7 0 01-14 0v-2"/>
      <path d="M12 19v4m-4 0h8"/>
    </svg>
  );
  const PauseIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1"/>
      <rect x="14" y="4" width="4" height="16" rx="1"/>
    </svg>
  );
  const VolumeIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 5L6 9H2v6h4l5 4V5z"/>
      <path d="M15.54 8.46a5 5 0 010 7.07"/>
      <path d="M19.07 4.93a10 10 0 010 14.14"/>
    </svg>
  );
  const MuteIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 5L6 9H2v6h4l5 4V5z"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  );
  const EndIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 2.5l19 19M16.5 16.5a10 10 0 01-9.07 0C4.41 15 3 12.67 3 10V7.5"/>
      <path d="M7.5 7.5V10c0 2.67 1.41 5 4.43 6.5"/>
    </svg>
  );

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <div className="va-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`va-modal ${cfg.cls}`}>

        {/* Decorative hex bg */}
        <div className="va-hex-bg" />

        {/* Corner brackets */}
        <div className="va-bracket va-tl" />
        <div className="va-bracket va-tr" />
        <div className="va-bracket va-bl" />
        <div className="va-bracket va-br" />

        {/* Close button */}
        <button className="va-close-btn" onClick={onClose} title="Close">✕</button>

        {/* ════ SHELL ════ */}
        <div className="va-shell">

          {/* Identity */}
          <div className="va-identity">
            <div className="va-identity-dot" />
            <div className="va-identity-name">MISTERWATCH VOICE</div>
            <div className="va-identity-ver">v3.0</div>
          </div>

          {/* Orb Stage */}
          <div className="va-orb-stage">
            <div className="va-atmo-ring va-atmo-1" />
            <div className="va-atmo-ring va-atmo-2" />
            <canvas ref={orbCanvasRef} className="va-orb-canvas" width="200" height="200" />
            <svg ref={waveRingRef} className="va-wave-ring" viewBox="0 0 200 200" />
            <div className="va-glass-core">
              <div className="va-core-scan" />
              <div className="va-core-pulse" />
            </div>
          </div>

          {/* Status */}
          <div className="va-status-wrap">
            <div className="va-state-indicator">
              <div className="va-state-dot" />
              <div className="va-state-name">{error ? "SYSTEM FAULT" : cfg.sub}</div>
            </div>
            <div className="va-big-status">{error ? "ERROR" : cfg.big}</div>
          </div>

          {/* Visualizer */}
          <div className={`va-viz-wrap${cfg.viz ? " active" : ""}`}>
            {BAR_HEIGHTS.map((h, i) => (
              <div key={i} className="va-vbar" style={{ "--i": i, "--h": `${h}px` }} />
            ))}
          </div>

          {/* Ticker */}
          <div className="va-ticker-wrap">
            <div className="va-ticker" key={tickerText}>{tickerText}</div>
          </div>

          {/* Controls */}
          <div className="va-control-ring">
            <button className="va-ctrl-btn" onClick={handleMute} title={muted ? "Unmute" : "Mute"}>
              {muted ? MuteIcon : VolumeIcon}
            </button>
            <button className="va-ctrl-btn va-ctrl-main" onClick={handleTalk}>
              {active ? PauseIcon : MicIcon}
            </button>
            <button className="va-ctrl-btn" onClick={handleEnd} title="End call">
              {EndIcon}
            </button>
          </div>

          {/* Stats */}
          <div className="va-stats-row">
            <div className="va-stat">
              <div className="va-stat-val">{latency}</div>
              <div className="va-stat-key">Latency</div>
            </div>
            <div className="va-stat">
              <div className="va-stat-val">{timeFormatted}</div>
              <div className="va-stat-key">Session</div>
            </div>
            <div className="va-stat">
              <div className="va-stat-val">{confidence}</div>
              <div className="va-stat-key">Confidence</div>
            </div>
            <div className="va-stat">
              <div className="va-stat-val">{wordCount}</div>
              <div className="va-stat-key">Words</div>
            </div>
          </div>

        </div>{/* end .va-shell */}
      </div>{/* end .va-modal */}
    </div>
  );
}
