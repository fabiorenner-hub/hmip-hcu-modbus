import type { JSX } from 'preact';
import { signal, effect } from '@preact/signals';
import { useRef, useEffect } from 'preact/hooks';
import { api } from '../store.js';
import { t, fmtNum, fmtTime } from '../i18n.js';
import { Panel, Card, EmptyState } from '../components.js';
import type { TrendSeries } from '../../../../shared/snapshot.js';

const series = signal<TrendSeries[]>([]);
const selected = signal<string | null>(null);
const expanded = signal(false);
let started = false;

function ensurePolling(): void {
  if (started) return;
  started = true;
  const tick = (): void => void api.trends().then((s) => { series.value = s; }).catch(() => undefined);
  tick();
  effect(() => {
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  });
}

function readCssVar(name: string, fallback: string): string {
  if (typeof getComputedStyle === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function Chart(props: { s: TrendSeries; height: number }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hover = signal<{ x: number; t: number; v: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = props.height;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const pts = props.s.points;
    if (pts.length < 2) {
      ctx.fillStyle = readCssVar('--color-faint', '#6b7686');
      ctx.font = '12px system-ui';
      ctx.fillText(t('Zu wenig Daten', 'Not enough data'), 12, cssH / 2);
      return;
    }

    const pad = { l: 44, r: 12, t: 12, b: 22 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;
    const ts = pts.map((p) => p.t);
    const vs = pts.map((p) => p.v);
    const tMin = Math.min(...ts);
    const tMax = Math.max(...ts);
    let vMin = Math.min(...vs);
    let vMax = Math.max(...vs);
    if (vMin === vMax) { vMin -= 1; vMax += 1; }
    const sx = (tv: number): number => pad.l + ((tv - tMin) / (tMax - tMin || 1)) * w;
    const sy = (vv: number): number => pad.t + h - ((vv - vMin) / (vMax - vMin || 1)) * h;

    // grid + axis labels
    ctx.strokeStyle = readCssVar('--color-card-border', '#232c3b');
    ctx.fillStyle = readCssVar('--color-muted', '#9aa6b8');
    ctx.font = '10px system-ui';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yy = pad.t + (h / 4) * i;
      const val = vMax - ((vMax - vMin) / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.l, yy);
      ctx.lineTo(pad.l + w, yy);
      ctx.stroke();
      ctx.fillText(fmtNum(val, 1), 4, yy + 3);
    }

    // line
    ctx.strokeStyle = readCssVar('--color-accent', '#f59e0b');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = sx(p.t);
      const y = sy(p.v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // crosshair
    const hv = hover.value;
    if (hv) {
      const x = sx(hv.t);
      const y = sy(hv.v);
      ctx.strokeStyle = readCssVar('--color-accent-strong', '#fbbf24');
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = readCssVar('--color-accent', '#f59e0b');
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const onMove = (e: MouseEvent): void => {
    const canvas = canvasRef.current;
    const pts = props.s.points;
    if (!canvas || pts.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const pad = { l: 44, r: 12 };
    const w = rect.width - pad.l - pad.r;
    const tMin = pts[0]!.t;
    const tMax = pts[pts.length - 1]!.t;
    const rel = Math.min(1, Math.max(0, (e.clientX - rect.left - pad.l) / (w || 1)));
    const targetT = tMin + rel * (tMax - tMin);
    let nearest = pts[0]!;
    for (const p of pts) if (Math.abs(p.t - targetT) < Math.abs(nearest.t - targetT)) nearest = p;
    hover.value = { x: e.clientX - rect.left, t: nearest.t, v: nearest.v };
  };

  return (
    <div class="chart-wrap">
      <canvas
        ref={canvasRef}
        class="chart-canvas"
        style={{ height: `${props.height}px` }}
        onMouseMove={onMove}
        onMouseLeave={() => { hover.value = null; }}
      />
      {hover.value ? (
        <div class="chart-tip" style={{ left: `${Math.min(hover.value.x + 8, 240)}px` }}>
          <strong>{fmtNum(hover.value.v)}</strong>
          <span>{fmtTime(hover.value.t)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function TrendsTab(): JSX.Element {
  ensurePolling();
  const list = series.value;
  if (selected.value === null && list[0]) selected.value = `${list[0].deviceId}:${list[0].bindingId}`;
  const current = list.find((s) => `${s.deviceId}:${s.bindingId}` === selected.value);

  return (
    <Panel
      title={t('Verläufe', 'Trends')}
      intro={t('Gepollte Zahlenwerte über die Zeit. Mauszeiger für Werte, Klick auf „Vollbild" zum Vergrößern.', 'Polled numeric values over time. Hover for values, use "Fullscreen" to enlarge.')}
      badge={`${list.length} ${t('Serien', 'series')}`}
    >
      {list.length === 0 ? (
        <Card><EmptyState message={t('Noch keine numerischen Werte erfasst', 'No numeric values captured yet')} /></Card>
      ) : (
        <Card>
          <div class="row-between">
            <select value={selected.value ?? ''} onChange={(e) => { selected.value = (e.target as HTMLSelectElement).value; }}>
              {list.map((s) => <option value={`${s.deviceId}:${s.bindingId}`}>{s.label}</option>)}
            </select>
            <button class="btn" type="button" onClick={() => { expanded.value = !expanded.value; }}>
              {expanded.value ? t('Verkleinern', 'Shrink') : t('Vollbild', 'Fullscreen')}
            </button>
          </div>
          {current ? <Chart s={current} height={expanded.value ? 460 : 240} /> : null}
        </Card>
      )}
    </Panel>
  );
}
