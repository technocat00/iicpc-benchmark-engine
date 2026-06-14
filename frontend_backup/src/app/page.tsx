'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import SubmitModal from '../components/SubmitModal';

// Palette tokens — indigo/violet/slate, lighter than pure cyan
const C = {
  accent:   '#818cf8', // indigo-400
  accentGlow: 'rgba(129,140,248,0.35)',
  violet:   '#a78bfa', // violet-400
  teal:     '#2dd4bf', // teal-400
  green:    '#34d399', // emerald-400
  red:      '#f87171', // red-400
  amber:    '#fbbf24', // amber-400
  text:     '#e2e8f0',
  muted:    '#94a3b8',
  dim:      '#475569',
  bg:       '#080c14',
  card:     '#0d1525',
  border:   '#1e2d4a',
  cardHov:  '#131e30',
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface ContestantScore {
  contestant_id: string;
  total_orders: number;
  failed_orders: number;
  correctness_pct: number;
  tps: number;
  p50_ns: number;
  p90_ns: number;
  p99_ns: number;
  snapshot_count: number;
  status: string;
  last_seen_ns: number;
  composite_score: number;
}

interface TickerEntry {
  id: string;
  side: 'BUY' | 'SELL';
  symbol: string;
  price: string;
  qty: number;
  time: string;
}

interface SparkPoint { t: number; v: number; }

// ─────────────────────────────────────────────────────────────
// Lightweight Particle Network — 30fps, 35 particles, CSS glow
// ─────────────────────────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W; canvas.height = H;
    };
    window.addEventListener('resize', resize);

    const NUM = 35;
    const particles = Array.from({ length: NUM }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r: Math.random() * 1.2 + 0.6,
    }));

    let raf: number;
    let lastTime = 0;
    const FPS = 30;
    const INTERVAL = 1000 / FPS;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      // Throttle to 30fps
      if (now - lastTime < INTERVAL) return;
      lastTime = now;

      ctx.clearRect(0, 0, W, H);

      // Update positions
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;
      }

      // Draw connections — early-exit bounding box
      const DIST = 120;
      for (let i = 0; i < NUM; i++) {
        for (let j = i + 1; j < NUM; j++) {
          const dx = particles[i].x - particles[j].x;
          if (Math.abs(dx) > DIST) continue;
          const dy = particles[i].y - particles[j].y;
          if (Math.abs(dy) > DIST) continue;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < DIST) {
            const alpha = (1 - dist / DIST) * 0.15;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(129,140,248,${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw dots
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(129,140,248,0.55)';
        ctx.fill();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: '100%', height: '100%',
        zIndex: 0, pointerEvents: 'none',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Custom Cursor (CSS-only tracking, no RAF loop)
// ─────────────────────────────────────────────────────────────
function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot  = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let rx = -100, ry = -100, mx = -100, my = -100;
    let raf: number;

    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
    window.addEventListener('mousemove', onMove);

    const loop = () => {
      rx += (mx - rx) * 0.15;
      ry += (my - ry) * 0.15;
      dot.style.transform  = `translate(${mx - 4}px, ${my - 4}px)`;
      ring.style.transform = `translate(${rx - 18}px, ${ry - 18}px)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <>
      <div ref={dotRef} style={{
        position: 'fixed', top: 0, left: 0,
        width: 8, height: 8,
        background: '#818cf8',
        borderRadius: '50%',
        pointerEvents: 'none', zIndex: 99999,
        boxShadow: '0 0 10px #818cf8, 0 0 24px rgba(129,140,248,0.3)',
        willChange: 'transform',
      }} />
      <div ref={ringRef} style={{
        position: 'fixed', top: 0, left: 0,
        width: 34, height: 34,
        border: '1px solid rgba(129,140,248,0.4)',
        borderRadius: '50%',
        pointerEvents: 'none', zIndex: 99998,
        willChange: 'transform',
      }} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Sparkline (canvas, only redraws when data changes)
// ─────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: SparkPoint[]; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || data.length < 2) return;
    const ctx = c.getContext('2d')!;
    const W = c.offsetWidth || 120, H = c.offsetHeight || 36;
    c.width = W; c.height = H;
    ctx.clearRect(0, 0, W, H);

    const vals = data.map(d => d.v);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const pts = data.map((d, i) => ({
      x: (i / (data.length - 1)) * W,
      y: H - ((d.v - min) / range) * (H - 4) - 2,
    }));

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + '44');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.moveTo(pts[0].x, H);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [data, color]);

  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
}

// ─────────────────────────────────────────────────────────────
// TPS History Chart (only redraws when data changes)
// ─────────────────────────────────────────────────────────────
function TpsChart({ history }: { history: SparkPoint[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || history.length < 2) return;
    const ctx = c.getContext('2d')!;
    const W = c.offsetWidth || 600, H = c.offsetHeight || 240;
    c.width = W; c.height = H;
    ctx.clearRect(0, 0, W, H);

    const vals = history.map(d => d.v);
    const max  = Math.max(...vals) * 1.15 || 100;
    const toX  = (i: number) => (i / (history.length - 1)) * W;
    const toY  = (v: number) => H - (v / max) * (H - 20) - 10;

    // Grid
    [0.25, 0.5, 0.75, 1].forEach(f => {
      const y = H - f * (H - 20) - 10;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(15,32,64,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.moveTo(0, y); ctx.lineTo(W, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(58,90,122,0.5)';
      ctx.font = '9px monospace';
      ctx.fillText(Math.round(max * f).toLocaleString(), 4, y - 3);
    });

    // Fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(0,212,255,0.2)');
    grad.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.moveTo(toX(0), H);
    history.forEach((d, i) => ctx.lineTo(toX(i), toY(d.v)));
    ctx.lineTo(toX(history.length - 1), H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    history.forEach((d, i) => i === 0 ? ctx.moveTo(toX(i), toY(d.v)) : ctx.lineTo(toX(i), toY(d.v)));
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Latest dot
    const lx = toX(history.length - 1), ly = toY(history[history.length - 1].v);
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#00d4ff'; ctx.fill();
  }, [history]);

  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

// ─────────────────────────────────────────────────────────────
// Latency Ring Gauge (SVG, no canvas, no RAF)
// ─────────────────────────────────────────────────────────────
function LatencyGauge({ p50, p90, p99 }: { p50: number; p90: number; p99: number }) {
  const R = 64, STROKE = 9;
  const CIRC = 2 * Math.PI * R;
  const MAX  = 10_000_000;
  const pct  = Math.min(p99 / MAX, 1);
  const dash = pct * CIRC;
  const color = pct < 0.3 ? '#00ff88' : pct < 0.7 ? '#ffaa00' : '#ff3366';
  const fmt = (ns: number) => ns >= 1_000_000 ? `${(ns/1_000_000).toFixed(1)}ms` : ns > 0 ? `${(ns/1000).toFixed(0)}µs` : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '8px 0' }}>
      <div style={{ position: 'relative', width: 152, height: 152 }}>
        <svg width="152" height="152" viewBox="0 0 152 152" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="76" cy="76" r={R} fill="none" stroke="rgba(15,32,64,0.9)" strokeWidth={STROKE} />
          <circle cx="76" cy="76" r={R} fill="none"
            stroke={color} strokeWidth={STROKE}
            strokeDasharray={`${dash} ${CIRC - dash}`}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 1.2s ease, stroke 0.5s' }}
          />
        </svg>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <span style={{ fontFamily: 'Orbitron,sans-serif', fontSize: 22, fontWeight: 700, color, textShadow: `0 0 16px ${color}`, display: 'block' }}>
            {fmt(p99)}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#3a5a7a', display: 'block', marginTop: 4, letterSpacing: 1 }}>
            P99 LATENCY
          </span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, width: '100%' }}>
        {([['P50', p50, '#00d4ff'], ['P90', p90, '#a855f7'], ['P99', p99, color]] as const).map(([lbl, val, clr]) => (
          <div key={lbl} style={{ textAlign: 'center', padding: '8px 4px', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid #0f2040' }}>
            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: '#3a5a7a', display: 'block', letterSpacing: 1, marginBottom: 4 }}>{lbl}</span>
            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 500, color: clr as string, display: 'block' }}>{fmt(val as number)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Live Clock
// ─────────────────────────────────────────────────────────────
function LiveClock() {
  const [t, setT] = useState('');
  useEffect(() => {
    const tick = () => setT(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#7aa2c8' }}>{t}</span>;
}

// ─────────────────────────────────────────────────────────────
// Ticker generator
// ─────────────────────────────────────────────────────────────
const SYMBOLS = ['AAPL','MSFT','TSLA','NVDA','AMZN','META','GOOG'];
let tickerId = 0;
function makeTicker(): TickerEntry {
  const side  = Math.random() > 0.5 ? 'BUY' : 'SELL';
  const sym   = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const price = (148 + Math.random() * 4).toFixed(2);
  const qty   = Math.floor(Math.random() * 100) + 1;
  const now   = new Date();
  const time  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  return { id: String(tickerId++), side, symbol: sym, price, qty, time };
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
export default function Page() {
  const [scores,     setScores]     = useState<ContestantScore[]>([]);
  const [wsStatus,   setWsStatus]   = useState<'connecting'|'connected'|'disconnected'>('connecting');
  const [tpsHistory, setTpsHistory] = useState<SparkPoint[]>([]);
  const [sparkMap,   setSparkMap]   = useState<Record<string, SparkPoint[]>>({});
  const [ticker,     setTicker]     = useState<TickerEntry[]>([]);
  const [activeTab,  setActiveTab]  = useState<'overview'|'metrics'|'orders'|'system'>('overview');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sorted   = [...scores].sort((a, b) => b.composite_score - a.composite_score);
  const maxScore = sorted[0]?.composite_score ?? 100;
  const totalTps = scores.reduce((s, c) => s + c.tps, 0);
  const totalOrd = scores.reduce((s, c) => s + c.total_orders, 0);
  const bestScore= sorted[0]?.composite_score ?? 0;
  const p99Best  = scores.length ? Math.min(...scores.map(c => c.p99_ns)) : 0;

  const fmtTps = (v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v.toFixed(0);
  const fmtNs  = (ns: number) => ns >= 1_000_000 ? `${(ns/1_000_000).toFixed(1)}ms` : ns > 0 ? `${(ns/1000).toFixed(0)}µs` : '—';

  // ── WebSocket & Throttling
  const wsRef = useRef<WebSocket | null>(null);
  const latestScoresRef = useRef<ContestantScore[]>([]);

  const connect = useCallback(() => {
    setWsStatus('connecting');
    const ws = new WebSocket('ws://localhost:4000/ws');
    wsRef.current = ws;
    ws.onopen  = () => setWsStatus('connected');
    ws.onclose = () => { setWsStatus('disconnected'); setTimeout(connect, 3000); };
    ws.onerror = () => setWsStatus('disconnected');
    ws.onmessage = (e) => {
      try {
        const arr = JSON.parse(e.data);
        const data = Array.isArray(arr) ? arr : [arr];
        // Just store the latest data, do NOT trigger React render here (prevents lag)
        if (data.length > 0) {
          latestScoresRef.current = data;
        }
      } catch {}
    };
  }, []);

  useEffect(() => { connect(); return () => wsRef.current?.close(); }, [connect]);

  // ── Throttled UI Render Loop (3 FPS)
  useEffect(() => {
    const id = setInterval(() => {
      const data = latestScoresRef.current;
      if (data.length === 0) return;

      setScores(data);
      const now = Date.now();
      const ttps = data.reduce((s, c) => s + c.tps, 0);
      
      setTpsHistory(h => [...h.slice(-49), { t: now, v: ttps }]);
      
      setSparkMap(prev => {
        const next = { ...prev };
        data.forEach(c => {
          next[c.contestant_id] = [...(prev[c.contestant_id] ?? []).slice(-19), { t: now, v: c.tps }];
        });
        return next;
      });
    }, 333); // ~3 FPS update rate for buttery smooth UI

    return () => clearInterval(id);
  }, []);

  // ── REST poll fallback every 3s (was 2s — lighter)
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('http://localhost:4000/api/scores');
        if (!res.ok) return;
        const data: ContestantScore[] = await res.json();
        const arr = Array.isArray(data) ? data : [data];
        setScores(arr);
        const now = Date.now();
        setTpsHistory(h => [...h.slice(-49), { t: now, v: arr.reduce((s,c) => s+c.tps, 0) }]);
      } catch {}
    };
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  // ── Ticker — 1 per 300ms, keep 20 orders for the new tab
  useEffect(() => {
    const id = setInterval(() => setTicker(t => [makeTicker(), ...t].slice(0, 20)), 300);
    return () => clearInterval(id);
  }, []);

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#020408', color: '#e8f4ff', fontFamily: 'Inter,sans-serif', overflowX: 'hidden' }}>
      <ParticleCanvas />
      <CustomCursor />

      {/* Scanlines */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,212,255,0.013) 2px, rgba(0,212,255,0.013) 4px)',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ── Navbar ──────────────────────────────────── */}
        <nav style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 36px',
          background: 'rgba(4,12,20,0.75)', backdropFilter: 'blur(18px)',
          borderBottom: '1px solid rgba(0,212,255,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'Orbitron,sans-serif', fontWeight: 700, fontSize: 16, color: '#818cf8', letterSpacing: 2, textShadow: '0 0 18px rgba(129,140,248,0.45)' }}>
            <div style={{
              width: 28, height: 28, border: '1.5px solid #818cf8', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 12px rgba(129,140,248,0.35)',
              animation: 'pulse-border 2.5s ease-in-out infinite',
            }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M1 12L4.5 5L8 8.5L12.5 1" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            ECHO ENGINE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <button 
              onClick={() => setIsModalOpen(true)}
              style={{ padding: '6px 16px', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: 20, color: '#06b6d4', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 600, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s', boxShadow: '0 0 10px rgba(6,182,212,0.1)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(6,182,212,0.2)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(6,182,212,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(6,182,212,0.1)'; e.currentTarget.style.boxShadow = '0 0 10px rgba(6,182,212,0.1)'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              SUBMIT
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 14px', borderRadius: 20, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#34d399', letterSpacing: 1 }}>
              <span style={{ width: 7, height: 7, background: '#34d399', borderRadius: '50%', boxShadow: '0 0 8px #34d399', display: 'inline-block', animation: 'live-pulse 1.2s ease-in-out infinite' }} />
              LIVE
            </div>
            <LiveClock />
          </div>
        </nav>

        {/* ── Hero ─────────────────────────────────────── */}
        <div style={{ padding: '120px 36px 40px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, letterSpacing: 4, textTransform: 'uppercase', color: '#818cf8', marginBottom: 18, opacity: 0.8 }}>
            ⬡ ECHO · BENCHMARK PLATFORM · 2026 ⬡
          </div>
          <h1 style={{ fontFamily: 'Orbitron,sans-serif', fontSize: 'clamp(24px,3.8vw,52px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 16 }}>
            <span style={{ color: '#818cf8', textShadow: '0 0 30px rgba(129,140,248,0.4)' }}>HFT ENGINE</span>
            {' '}
            <span style={{ color: '#a78bfa', textShadow: '0 0 30px rgba(167,139,250,0.4)' }}>BENCHMARK</span>
          </h1>
          <p style={{ color: '#94a3b8', maxWidth: 480, margin: '0 auto 36px', lineHeight: 1.7, fontSize: 14 }}>
            Real-time latency, throughput &amp; correctness scoring. Live Kafka stream at nanosecond precision.
          </p>
        </div>

        {/* ── Tab Navigation ───────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 36, padding: '0 36px' }}>
          {[
            { id: 'overview', label: 'OVERVIEW' },
            { id: 'metrics', label: 'METRICS' },
            { id: 'orders', label: 'ORDER FLOW' },
            { id: 'system', label: 'SYSTEM HEALTH' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                background: activeTab === tab.id ? 'rgba(129,140,248,0.15)' : 'rgba(13,21,37,0.5)',
                border: `1px solid ${activeTab === tab.id ? '#818cf8' : '#1e2d4a'}`,
                color: activeTab === tab.id ? '#e2e8f0' : '#94a3b8',
                padding: '10px 24px',
                borderRadius: 8,
                fontFamily: 'Orbitron,sans-serif',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 2,
                transition: 'all 0.2s',
                boxShadow: activeTab === tab.id ? '0 0 16px rgba(129,140,248,0.2)' : 'none',
                cursor: 'none'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── TAB: OVERVIEW ────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, margin: '0 36px 28px', background: 'rgba(129,140,248,0.07)', border: '1px solid rgba(129,140,248,0.12)', borderRadius: 14, overflow: 'hidden' }}>
              {[
                { label: 'TOTAL TPS',    value: fmtTps(totalTps),             unit: 'orders/sec',  accent: '#818cf8' },
                { label: 'TOTAL ORDERS', value: totalOrd.toLocaleString(),     unit: 'processed',   accent: '#a78bfa' },
                { label: 'BEST P99',     value: fmtNs(p99Best),               unit: 'latency',     accent: p99Best < 3_000_000 ? '#34d399' : '#fbbf24' },
                { label: 'TOP SCORE',    value: bestScore.toFixed(1),          unit: 'composite',   accent: '#fbbf24' },
              ].map((s, i) => (
                <div key={i} style={{ background: '#0d1525', padding: '22px 18px', cursor: 'default', transition: 'background 0.3s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#131e30')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#0d1525')}
                >
                  <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#475569', marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontFamily: 'Orbitron,sans-serif', fontSize: 24, fontWeight: 700, color: s.accent, textShadow: `0 0 16px ${s.accent}55`, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{s.unit}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: '0 36px', marginBottom: 60 }}>
              <div style={{ background: '#0d1525', border: '1px solid #1e2d4a', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #1e2d4a' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Orbitron,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', boxShadow: '0 0 8px #818cf8', display: 'inline-block' }} />
                    LIVE THROUGHPUT
                  </div>
                  <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#818cf8' }}>{fmtTps(totalTps)} TPS</span>
                </div>
                <div style={{ padding: '14px 18px', height: 280 }}>
                  <TpsChart history={tpsHistory} />
                </div>
              </div>

              <div style={{ background: '#0d1525', border: '1px solid #1e2d4a', borderRadius: 14, overflow: 'hidden', minHeight: 500 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #1e2d4a' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Orbitron,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 8px #a78bfa', display: 'inline-block' }} />
                    LEADERBOARD
                  </div>
                  <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#475569' }}>{sorted.length} CONTESTANTS</span>
                </div>
                {sorted.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', fontFamily: 'JetBrains Mono,monospace', color: '#475569', fontSize: 13 }}>
                    Waiting for contestants to connect...
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['#','CONTESTANT','TPS','P99','SCORE'].map(h => (
                          <th key={h} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, fontWeight: 500, letterSpacing: 2, textTransform: 'uppercase', color: '#475569', padding: '8px 14px', textAlign: 'left', borderBottom: '1px solid #1e2d4a' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((c, i) => {
                        const rankColors = [
                          { bg:'rgba(255,170,0,0.12)', color:'#ffaa00', border:'rgba(255,170,0,0.3)' },
                          { bg:'rgba(160,174,192,0.12)', color:'#a0aec0', border:'rgba(160,174,192,0.3)' },
                          { bg:'rgba(205,127,50,0.12)', color:'#cd7f32', border:'rgba(205,127,50,0.3)' },
                        ];
                        const rc = rankColors[i] ?? { bg:'rgba(0,212,255,0.06)', color:'#3a5a7a', border:'#0f2040' };
                        return (
                          <tr key={c.contestant_id} style={{ borderBottom: '1px solid rgba(30,45,74,0.5)', transition: 'background 0.2s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(129,140,248,0.04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Orbitron,sans-serif', fontSize: 11, fontWeight: 700, background: rc.bg, color: rc.color, border: `1px solid ${rc.border}` }}>{i+1}</div>
                            </td>
                            <td style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>
                              <div style={{ color: '#e2e8f0', fontWeight: 500 }}>{c.contestant_id}</div>
                              <div style={{ height: 3, background: '#1e2d4a', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${(c.composite_score / maxScore) * 100}%`, background: 'linear-gradient(90deg,#818cf8,#a78bfa)', borderRadius: 2, transition: 'width 1s ease' }} />
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: '#818cf8' }}>{fmtTps(c.tps)}/s</td>
                            <td style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: c.p99_ns < 3_000_000 ? '#34d399' : '#fbbf24' }}>{fmtNs(c.p99_ns)}</td>
                            <td style={{ padding: '12px 14px', fontFamily: 'Orbitron,sans-serif', fontSize: 14, fontWeight: 700, color: '#fbbf24', textShadow: '0 0 10px rgba(251,191,36,0.4)' }}>{c.composite_score.toFixed(1)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── TAB: METRICS ─────────────────────────────── */}
        {activeTab === 'metrics' && (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 1fr', gap: 20, padding: '0 36px 60px' }}>
            <div style={{ background: '#0d1525', border: '1px solid #1e2d4a', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #1e2d4a', fontFamily: 'Orbitron,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 8px #a78bfa', display: 'inline-block' }} />
                LATENCY MONITOR
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'center', borderBottom: '1px solid #1e2d4a' }}>
                <LatencyGauge p50={scores[0]?.p50_ns ?? 0} p90={scores[0]?.p90_ns ?? 0} p99={scores[0]?.p99_ns ?? 0} />
              </div>
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'Orbitron,sans-serif', color: '#64748b', fontWeight: 700 }}>
                  <span style={{ width: 85 }}>TEAM</span>
                  <span style={{ width: 60, textAlign: 'right' }}>P50</span>
                  <span style={{ width: 60, textAlign: 'right' }}>P90</span>
                  <span style={{ width: 60, textAlign: 'right' }}>P99</span>
                </div>
                {sorted.length === 0 ? <div style={{ color: '#475569', fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>No data yet</div>
                : sorted.map(c => {
                  const displayName = c.contestant_id.replace('contestant-', 'Team ');
                  return (
                  <div key={c.contestant_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: 'JetBrains Mono,monospace' }}>
                    <span style={{ color: '#94a3b8', width: 85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
                    <span style={{ color: '#4ade80', width: 60, textAlign: 'right' }}>{fmtNs(c.p50_ns)}</span>
                    <span style={{ color: '#fbbf24', width: 60, textAlign: 'right' }}>{fmtNs(c.p90_ns)}</span>
                    <span style={{ color: '#f87171', width: 60, textAlign: 'right', fontWeight: c.p99_ns > 3_000_000 ? 700 : 400 }}>{fmtNs(c.p99_ns)}</span>
                  </div>
                  );
                })}
              </div>
            </div>

            <div style={{ background: '#0d1525', border: '1px solid #1e2d4a', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #1e2d4a', fontFamily: 'Orbitron,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399', display: 'inline-block' }} />
                CORRECTNESS
              </div>
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {sorted.length === 0 ? <div style={{ color: '#475569', fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>No data yet</div>
                : sorted.map(c => (
                  <div key={c.contestant_id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#94a3b8' }}>{c.contestant_id.replace('contestant-', 'Team ')}</span>
                      <span style={{ fontFamily: 'Orbitron,monospace', fontSize: 12, fontWeight: 700, color: c.correctness_pct===100?'#34d399':'#f87171' }}>{c.correctness_pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 5, background: '#1e2d4a', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${c.correctness_pct}%`, background: c.correctness_pct===100?'linear-gradient(90deg,#818cf8,#34d399)':'linear-gradient(90deg,#f87171,#fbbf24)', borderRadius: 3, transition: 'width 1.5s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: '#0d1525', border: '1px solid #1e2d4a', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #1e2d4a', fontFamily: 'Orbitron,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', boxShadow: '0 0 8px #a78bfa', display: 'inline-block' }} />
                PER-CONTESTANT TPS
              </div>
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {sorted.length === 0 ? <div style={{ color: '#475569', fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>No data yet</div>
                : sorted.map((c, i) => {
                  const colors = ['#818cf8','#a78bfa','#34d399','#fbbf24','#f87171'];
                  const clr = colors[i % colors.length];
                  return (
                    <div key={c.contestant_id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ minWidth: 90 }}>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: '#94a3b8', display: 'block' }}>{c.contestant_id.replace('contestant-', 'Team ')}</span>
                        <span style={{ fontFamily: 'Orbitron,sans-serif', fontSize: 13, fontWeight: 700, color: clr, display: 'block' }}>{fmtTps(c.tps)}/s</span>
                      </div>
                      <div style={{ flex: 1, height: 34 }}>
                        <Sparkline data={sparkMap[c.contestant_id] ?? []} color={clr} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: ORDER FLOW ──────────────────────────── */}
        {activeTab === 'orders' && (
          <div style={{ padding: '0 36px 60px' }}>
            <div style={{ background: '#0d1525', border: '1px solid #1e2d4a', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #1e2d4a' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Orbitron,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399', display: 'inline-block', animation: 'live-pulse 1s infinite' }} />
                  LIVE ORDER FLOW (SIMULATED)
                </div>
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6, height: 500, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(transparent, #0d1525)', zIndex: 1, pointerEvents: 'none' }} />
                {ticker.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px', background: 'rgba(0,0,0,0.15)', borderRadius: 8, border: '1px solid #1e2d4a', fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 4, letterSpacing: 1, background: t.side==='BUY'?'rgba(52,211,153,0.12)':'rgba(248,113,113,0.12)', color: t.side==='BUY'?'#34d399':'#f87171' }}>{t.side}</span>
                    <span style={{ color: '#e2e8f0', fontWeight: 500, fontSize: 13, width: 60 }}>{t.symbol}</span>
                    <span style={{ color: '#475569', fontSize: 12, width: 60 }}>{t.qty} ×</span>
                    <span style={{ color: '#818cf8', flex: 1 }}>${t.price}</span>
                    <span style={{ color: '#475569', fontSize: 11 }}>{t.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: SYSTEM HEALTH ───────────────────────── */}
        {activeTab === 'system' && (
          <div style={{ padding: '0 36px 60px' }}>
            <div style={{ background: '#0d1525', border: '1px solid #1e2d4a', borderRadius: 14, overflow: 'hidden', maxWidth: 600, margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #1e2d4a', fontFamily: 'Orbitron,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 8px #fbbf24', display: 'inline-block' }} />
                SYSTEM STATUS
              </div>
              <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'Redpanda (Kafka) Event Bus', ok: wsStatus==='connected' },
                  { label: 'Telemetry Ingester Core',    ok: wsStatus==='connected' },
                  { label: 'Redis Time-Series Cache',    ok: scores.length > 0 },
                  { label: 'Distributed Load Generators', ok: scores.some(s => s.total_orders > 0) },
                  { label: 'Live WebSocket Stream',      ok: wsStatus==='connected' },
                  { label: 'Contestant Sandbox Engines', ok: true },
                ].map(({ label, ok }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'JetBrains Mono,monospace', fontSize: 13, paddingBottom: 16, borderBottom: '1px solid rgba(30,45,74,0.3)' }}>
                    <span style={{ color: '#94a3b8' }}>{label}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: ok?'#34d399':'#f87171', fontWeight: 600 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok?'#34d399':'#f87171', boxShadow: ok?'0 0 10px #34d399':'0 0 10px #f87171', display: 'inline-block' }} />
                      {ok ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Connection Banner */}
      <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'rgba(13,21,37,0.92)', border: '1px solid rgba(129,140,248,0.18)', borderRadius: 12, backdropFilter: 'blur(16px)', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#94a3b8', zIndex: 200 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block', background: wsStatus==='connected'?'#34d399':wsStatus==='connecting'?'#fbbf24':'#f87171', boxShadow: `0 0 8px ${wsStatus==='connected'?'#34d399':wsStatus==='connecting'?'#fbbf24':'#f87171'}` }} />
        {wsStatus === 'connected'    && 'WebSocket — streaming live'}
        {wsStatus === 'connecting'   && 'Connecting to ingester...'}
        {wsStatus === 'disconnected' && 'Reconnecting in 3s...'}
      </div>

      {isModalOpen && <SubmitModal onClose={() => setIsModalOpen(false)} />}

      {/* CSS Keyframes */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;cursor:none;}
        body{overflow-x:hidden;background:#080c14;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-track{background:#080c14;}
        ::-webkit-scrollbar-thumb{background:#818cf8;border-radius:2px;}
        @keyframes live-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.4;transform:scale(0.8);}}
        @keyframes pulse-border{0%,100%{box-shadow:0 0 12px rgba(129,140,248,0.35);}50%{box-shadow:0 0 24px rgba(129,140,248,0.7);}}
      `}</style>
    </div>
  );
}
