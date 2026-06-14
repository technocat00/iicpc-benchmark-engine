"use client";

import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Contestant {
  id: string; name: string; lang: string; tps: number;
  p50: number; p99: number; correctness: number; status: "live" | "degraded" | "failed";
}

// ── Colour tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      "#070b0f",
  surface: "#0d1117",
  card:    "#0d1117",
  border:  "#1c2430",
  accent:  "#00c8ff",     // electric cyan
  gold:    "#e8b84b",     // warmer gold than amsderive
  text:    "#c9d1d9",
  muted:   "#4a5568",
  live:    "#3dffa0",
  warn:    "#f0a500",
  fail:    "#ff4757",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const mono = "var(--font-plex-mono, 'JetBrains Mono', monospace)";
const serif = "var(--font-pt-serif, Georgia, serif)";

function StatusDot({ status }: { status: Contestant["status"] }) {
  const col = status === "live" ? C.live : status === "degraded" ? C.warn : C.fail;
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: col, boxShadow: `0 0 8px ${col}`, marginRight: 6,
      animation: status === "live" ? "pulse 2s ease-in-out infinite" : "none",
    }} />
  );
}

function LiveBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: mono, fontSize: ".65rem", letterSpacing: ".15em",
      textTransform: "uppercase", color: C.live,
      background: `${C.live}18`, border: `1px solid ${C.live}40`,
      borderRadius: 2, padding: "4px 10px"
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.live, animation: "pulse 2s ease-in-out infinite", display: "inline-block" }} />
      Streaming
    </span>
  );
}

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / 60;
    const id = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(id); }
      else setVal(Math.floor(start));
    }, 16);
    return () => clearInterval(id);
  }, [target]);
  return <>{val.toLocaleString()}{suffix}</>;
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: "10px 14px", fontFamily: mono, fontSize: "11px", color: C.text }}>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>{p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</strong></div>
      ))}
    </div>
  );
};

// ── Submit Modal Component ──────────────────────────────────────────────────────
function SubmitModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setStatus("Please select a .cpp file");
      return;
    }
    
    setIsSubmitting(true);
    setStatus("Uploading to Sandbox...");
    
    const formData = new FormData();
    formData.append("binary", file);
    
    try {
      const res = await fetch("http://localhost:8000/api/submit", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(`Success! ID: ${data.submission_id}`);
        setTimeout(() => { onClose(); setStatus(""); setFile(null); }, 2000);
      } else {
        setStatus(`Error: ${data.message || "Upload failed"}`);
      }
    } catch (err: any) {
      setStatus(`Network Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 32, width: 400, color: C.text }}>
        <h2 style={{ fontFamily: serif, marginTop: 0, color: "#fff" }}>Submit Engine</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontFamily: mono, fontSize: ".7rem", color: C.muted, textTransform: "uppercase", letterSpacing: ".1em" }}>Engine Source (.cpp)</label>
            <input 
              type="file" 
              accept=".cpp" 
              onChange={e => setFile(e.target.files?.[0] || null)}
              style={{ display: "block", width: "100%", padding: "8px 0", fontFamily: mono, fontSize: ".8rem" }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 16 }}>
            <button type="button" onClick={onClose} style={{ background: "transparent", color: C.muted, border: "none", cursor: "pointer", fontFamily: mono, fontSize: ".8rem" }}>Cancel</button>
            <button type="submit" disabled={isSubmitting} style={{ background: C.live, color: "#000", border: "none", borderRadius: 4, padding: "8px 16px", cursor: isSubmitting ? "not-allowed" : "pointer", fontFamily: mono, fontSize: ".8rem", fontWeight: 700 }}>
              {isSubmitting ? "Deploying..." : "Deploy to Sandbox"}
            </button>
          </div>
          {status && <div style={{ fontFamily: mono, fontSize: ".75rem", color: status.includes("Error") ? C.fail : C.accent, marginTop: 8 }}>{status}</div>}
        </form>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [latData, setLatData] = useState<any[]>([]);
  const [tpsData, setTpsData]  = useState<any[]>([]);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<HTMLDivElement>(null);

  const [wsUrlInput, setWsUrlInput] = useState("");
  const [activeWsUrl, setActiveWsUrl] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);

  // Set default URL on mount
  useEffect(() => {
    const defaultUrl = `ws://${window.location.hostname}:4000/ws`;
    setWsUrlInput(defaultUrl);
    setActiveWsUrl(defaultUrl);
  }, []);

  // Connect to live WebSocket
  useEffect(() => {
    if (!activeWsUrl) return;

    const wsUrl = activeWsUrl;
    const ws = new WebSocket(wsUrl);
    let timeTick = 0;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // data is an array of ContestantScore
        if (Array.isArray(data)) {
          const mapped: Contestant[] = data.map((d: any) => ({
            id: d.contestant_id,
            name: d.contestant_id, // We just use ID as name since backend only sends ID
            lang: "Engine", // generic
            tps: d.tps || 0,
            p50: d.p50_ns || 0,
            p99: d.p99_ns || 0,
            correctness: d.correctness_pct || 0,
            status: d.status || "live",
          }));
          setContestants(mapped);

          // Aggregate for global charts
          const globalTps = mapped.reduce((sum, c) => sum + c.tps, 0);
          const globalP50 = mapped.length ? Math.round(mapped.reduce((sum, c) => sum + c.p50, 0) / mapped.length) : 0;
          const globalP99 = mapped.length ? Math.max(...mapped.map(c => c.p99)) : 0;

          setTpsData(prev => [...prev.slice(-19), { t: timeTick, tps: globalTps }]);
          setLatData(prev => [...prev.slice(-19), { t: timeTick, p50: globalP50, p99: globalP99 }]);
          timeTick++;

          const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
          setLogs(l => [...l.slice(-40), `[${ts}] METRIC   p99=${globalP99}ns  TPS=${globalTps.toFixed(0)}`]);
          if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message", e);
      }
    };

    ws.onopen = () => {
      setIsConnected(true);
      const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
      setLogs(l => [...l.slice(-40), `[${ts}] SYSTEM   WebSocket Connected to ${wsUrl}`]);
    };

    ws.onclose = () => {
      setIsConnected(false);
      const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
      setLogs(l => [...l.slice(-40), `[${ts}] SYSTEM   WebSocket Disconnected`]);
    };

    return () => {
      ws.close();
      setIsConnected(false);
    };
  }, [activeWsUrl]);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "var(--font-inter, sans-serif)" }}>
      <SubmitModal isOpen={isSubmitOpen} onClose={() => setIsSubmitOpen(false)} />

      {/* ── NAV ──────────────────────────────────────────────────────────────── */}
      <nav style={{
        position: "fixed", inset: "0 0 auto 0", height: 60, zIndex: 100,
        background: `${C.bg}e0`, backdropFilter: "blur(16px)",
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Logo mark */}
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: `linear-gradient(135deg, ${C.accent}, #0057ff)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 20px ${C.accent}50`,
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 14 L8 2 L14 14" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none" />
              <path d="M4 10 H12" stroke="white" strokeWidth="1.5" />
            </svg>
          </div>
          <span style={{ fontFamily: serif, fontWeight: 700, fontSize: "1.05rem", color: "#fff", letterSpacing: ".04em" }}>
            IICPC Benchmark Engine
          </span>
          <span style={{ fontFamily: mono, fontSize: ".6rem", color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginLeft: 8, paddingLeft: 8, borderLeft: `1px solid ${C.border}` }}>
            Hackathon 2026
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <button
            onClick={() => setIsSubmitOpen(true)}
            style={{ background: "transparent", color: C.accent, border: `1px solid ${C.accent}80`, borderRadius: 4, padding: "6px 16px", fontFamily: mono, fontSize: ".7rem", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}
          >
            Submit Engine
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.card, padding: "4px 8px", borderRadius: 4, border: `1px solid ${C.border}` }}>
            <input 
              type="text" 
              value={wsUrlInput}
              onChange={(e) => setWsUrlInput(e.target.value)}
              placeholder="ws://localhost:4000/ws"
              style={{ background: "transparent", border: "none", color: C.text, fontFamily: mono, fontSize: ".7rem", width: 200, outline: "none" }}
            />
            <button 
              onClick={() => setActiveWsUrl(wsUrlInput)}
              style={{ background: C.accent, color: C.bg, border: "none", borderRadius: 2, padding: "4px 12px", fontFamily: mono, fontSize: ".65rem", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}
            >
              Connect
            </button>
          </div>
          {isConnected && <LiveBadge />}
          <span suppressHydrationWarning style={{ fontFamily: mono, fontSize: ".65rem", color: C.muted, letterSpacing: ".1em" }}>
            {new Date().toLocaleTimeString("en-US", { hour12: false })}
          </span>
        </div>
      </nav>

      {/* ── HERO STATS BAR ───────────────────────────────────────────────────── */}
      <div style={{ paddingTop: 60 }}>
        <div style={{
          background: `linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`,
          borderBottom: `1px solid ${C.border}`,
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        }}>
          {[
            { label: "Global Throughput", value: 9500, unit: "TPS",   color: C.accent },
            { label: "Fleet Active",      value: 1024,  unit: "Bots",  color: C.text  },
            { label: "p99 Latency",       value: 245,   unit: "ns",    color: C.gold  },
            { label: "Correctness",       value: 99,    unit: "% avg", color: C.live  },
          ].map(({ label, value, unit, color }, i) => (
            <div key={label} style={{
              padding: "32px 40px",
              borderRight: i < 3 ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{ fontFamily: mono, fontSize: ".62rem", letterSpacing: ".15em", textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>{label}</div>
              <div style={{ fontFamily: serif, fontSize: "2.6rem", fontWeight: 700, color, lineHeight: 1, letterSpacing: "-.02em" }}>
                <Counter target={value} /><span style={{ fontFamily: mono, fontSize: ".9rem", color: C.muted, fontWeight: 400, marginLeft: 6 }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN GRID ────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 40px", display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>

        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* ── Charts ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* Latency */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: 24, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.accent}, transparent)` }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: mono, fontSize: ".6rem", letterSpacing: ".15em", textTransform: "uppercase", color: C.muted }}>Latency Stream</div>
                  <div style={{ fontFamily: serif, fontSize: "1.1rem", fontWeight: 700, color: "#fff", marginTop: 4 }}>p50 / p99 (ns)</div>
                </div>
                <LiveBadge />
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={latData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lp99" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.accent} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={C.accent} stopOpacity={0}    />
                    </linearGradient>
                    <linearGradient id="lp50" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.gold} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={C.gold} stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke={C.border} vertical={false} />
                  <XAxis dataKey="t" hide />
                  <YAxis tick={{ fill: C.muted, fontSize: 9, fontFamily: mono }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="p99" stroke={C.accent} strokeWidth={2} fill="url(#lp99)" name="p99" dot={false} />
                  <Area type="monotone" dataKey="p50" stroke={C.gold}   strokeWidth={1.5} fill="url(#lp50)" name="p50" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* TPS */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: 24, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.live}, transparent)` }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: mono, fontSize: ".6rem", letterSpacing: ".15em", textTransform: "uppercase", color: C.muted }}>Throughput</div>
                  <div style={{ fontFamily: serif, fontSize: "1.1rem", fontWeight: 700, color: "#fff", marginTop: 4 }}>Orders / Second</div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={tpsData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ltps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.live} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={C.live} stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke={C.border} vertical={false} />
                  <XAxis dataKey="t" hide />
                  <YAxis tick={{ fill: C.muted, fontSize: 9, fontFamily: mono }} tickLine={false} axisLine={false} domain={["dataMin - 1000", "dataMax + 1000"]} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={9000} stroke={`${C.live}50`} strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="tps" stroke={C.live} strokeWidth={2} fill="url(#ltps)" name="TPS" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Leaderboard ── */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
            {/* header */}
            <div style={{ padding: "20px 28px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: ".6rem", letterSpacing: ".15em", textTransform: "uppercase", color: C.muted }}>Live Rankings</div>
                <div style={{ fontFamily: serif, fontSize: "1.2rem", fontWeight: 700, color: "#fff", marginTop: 4 }}>Contestant Execution Matrix</div>
              </div>
              <div style={{ fontFamily: mono, fontSize: ".6rem", color: C.muted, letterSpacing: ".1em" }}>
                Updated every 1.5s
              </div>
            </div>

            {/* column headers */}
            <div style={{
              display: "grid", gridTemplateColumns: "48px 1fr 100px 120px 120px 120px 100px",
              padding: "10px 28px", gap: 16,
              borderBottom: `1px solid ${C.border}`,
              background: `${C.surface}80`,
            }}>
              {["#", "Engine", "Lang", "TPS", "p50", "p99", "State"].map((h, i) => (
                <div key={h} style={{ fontFamily: mono, fontSize: ".58rem", letterSpacing: ".15em", textTransform: "uppercase", color: C.muted, textAlign: i > 1 ? "right" : "left" }}>{h}</div>
              ))}
            </div>

            {contestants.sort((a, b) => b.tps - a.tps).map((c, i) => {
              const stateCol = c.status === "live" ? C.live : c.status === "degraded" ? C.warn : C.fail;
              return (
                <div key={c.id} style={{
                  display: "grid", gridTemplateColumns: "48px 1fr 100px 120px 120px 120px 100px",
                  padding: "16px 28px", gap: 16, alignItems: "center",
                  borderBottom: i < contestants.length - 1 ? `1px solid ${C.border}50` : "none",
                  transition: "background .15s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}08`)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ fontFamily: mono, fontSize: ".75rem", color: i < 3 ? C.gold : C.muted, fontWeight: 700 }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-inter, sans-serif)", fontSize: ".9rem", color: "#fff", fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontFamily: mono, fontSize: ".58rem", color: C.muted, letterSpacing: ".08em", marginTop: 3 }}>{c.id}</div>
                  </div>
                  <div style={{ fontFamily: mono, fontSize: ".72rem", color: C.muted, textAlign: "right", letterSpacing: ".06em" }}>{c.lang}</div>
                  <div style={{ fontFamily: mono, fontSize: ".82rem", color: C.text, textAlign: "right", fontWeight: 600 }}>{c.tps.toLocaleString()}</div>
                  <div style={{ fontFamily: mono, fontSize: ".82rem", color: C.text, textAlign: "right" }}>{c.p50} ns</div>
                  <div style={{ fontFamily: mono, fontSize: ".82rem", color: c.p99 < 200 ? C.live : c.p99 < 1000000 ? C.gold : C.fail, textAlign: "right", fontWeight: 600 }}>{c.p99 < 1000000 ? `${(c.p99/1000).toFixed(0)} µs` : `${(c.p99/1000000).toFixed(1)} ms`}</div>
                  <div style={{ textAlign: "right" }}>
                    <StatusDot status={c.status} />
                    <span style={{ fontFamily: mono, fontSize: ".62rem", color: stateCol, letterSpacing: ".1em", textTransform: "uppercase" }}>{c.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN — Live Log */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* System health */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: 24 }}>
            <div style={{ fontFamily: mono, fontSize: ".6rem", letterSpacing: ".15em", textTransform: "uppercase", color: C.muted, marginBottom: 20 }}>System Health</div>
            {[
              { label: "Sandbox Pods",     value: "5 / 5",   ok: true  },
              { label: "Kafka Brokers",    value: "3 / 3",   ok: true  },
              { label: "Bot Fleet",        value: "1024",    ok: true  },
              { label: "Telemetry Lag",    value: "12 ms",   ok: true  },
              { label: "Failed Subs",      value: "1 / 5",   ok: false },
            ].map(({ label, value, ok }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontFamily: mono, fontSize: ".72rem", color: C.muted }}>{label}</span>
                <span style={{ fontFamily: mono, fontSize: ".72rem", fontWeight: 700, color: ok ? C.live : C.fail }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Live terminal log */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.fail }} />
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.warn }} />
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.live }} />
              <span style={{ fontFamily: mono, fontSize: ".6rem", letterSpacing: ".15em", textTransform: "uppercase", color: C.muted, marginLeft: 8 }}>
                Telemetry Log
              </span>
            </div>
            <div ref={logsRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px", maxHeight: 420, scrollbarWidth: "none" }}>
              {logs.map((log, i) => {
                const isMetric = log.includes("METRIC");
                const isKafka  = log.includes("KAFKA");
                const isSandbox = log.includes("SANDBOX");
                const col = isMetric ? C.accent : isKafka ? C.gold : isSandbox ? C.live : C.muted;
                return (
                  <div key={i} style={{ fontFamily: mono, fontSize: ".65rem", color: col, lineHeight: 1.8, opacity: i === logs.length - 1 ? 1 : 0.6, transition: "opacity .3s" }}>
                    {log}
                  </div>
                );
              })}
              <div style={{ fontFamily: mono, fontSize: ".65rem", color: C.accent }}>▌</div>
            </div>
          </div>
        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: mono, fontSize: ".62rem", color: C.muted, letterSpacing: ".1em" }}>
          © 2026 IICPC Benchmark Engine — Distributed Load Testing Platform
        </div>
        <div style={{ display: "flex", gap: 20, fontFamily: mono, fontSize: ".62rem", color: C.muted, letterSpacing: ".1em" }}>
          <span>Rust · C++ · Go · Kafka · Kubernetes</span>
        </div>
      </footer>

      {/* ── GLOBAL STYLES ── */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1c2430; border-radius: 2px; }
        body { background: #070b0f; }
      `}</style>
    </div>
  );
}
