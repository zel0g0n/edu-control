"use client";

import { useId, useState } from "react";

import { cx, toneBg, type Tone } from "./ui";

const TONE_VAR: Record<Tone, string> = {
  primary: "var(--primary)", ok: "var(--ok)", info: "var(--info)", warn: "var(--warn)", bad: "var(--bad)", slate: "var(--slate)",
};

function niceStep(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export interface BarDatum {
  label: string;
  value: number;
  /** Ustun ustidagi yozuv (masalan, "92%"). */
  display?: string;
  tone?: Tone;
  /** Sichqoncha ustida batafsil. */
  hint?: string;
}

/** Vertikal ustunli diagramma. Barcha o'lchamlar bitta shkalada. */
export function BarChart({
  data, max, height = 180, format = (v) => String(Math.round(v)), tone = "primary", target,
}: {
  data: BarDatum[];
  max?: number;
  height?: number;
  format?: (v: number) => string;
  tone?: Tone;
  /** Gorizontal maqsad chizig'i. */
  target?: { value: number; label: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = max ?? niceMax(Math.max(...data.map((d) => d.value), target?.value ?? 0));
  const W = Math.max(320, data.length * 44);
  const padL = 36, padB = 26, padT = 18;
  const H = height;
  const plotH = H - padB - padT;
  const step = (W - padL) / Math.max(1, data.length);
  const barW = Math.min(36, step * 0.62);
  const y = (v: number) => padT + plotH - (Math.max(0, v) / top) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * top);

  return (
    <div className="scroll-x">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full min-w-[320px]" style={{ height: H }} role="img"
        aria-label={data.map((d) => `${d.label}: ${d.display ?? format(d.value)}`).join(", ")}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v === 0 ? undefined : "3 4"} />
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tabular">{format(v)}</text>
          </g>
        ))}
        {target && (
          <g>
            <line x1={padL} x2={W} y1={y(target.value)} y2={y(target.value)} stroke="var(--margin)" strokeWidth="1.5" />
            <text x={padL + 4} y={y(target.value) - 5} textAnchor="start" fontSize="11" fill="var(--margin)" fontWeight="600">{target.label}</text>
          </g>
        )}
        {data.map((d, i) => {
          const x = padL + step * i + (step - barW) / 2;
          const h = Math.max(d.value > 0 ? 2 : 0, y(0) - y(d.value));
          return (
            <g key={`${d.label}-${i}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + step * i} y={padT} width={step} height={plotH} fill="transparent" />
              <rect x={x} y={y(0) - h} width={barW} height={h} rx={Math.min(6, barW / 3)} fill={TONE_VAR[d.tone ?? tone]} opacity={hover === null || hover === i ? 1 : 0.45} />
              <text x={x + barW / 2} y={y(0) - h - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink)" className="tabular">
                {d.display ?? format(d.value)}
              </text>
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.label}</text>
              {d.hint && <title>{d.hint}</title>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface LineSeries {
  name: string;
  tone: Tone;
  values: (number | null)[];
}

/** Chiziqli diagramma (kunlar bo'yicha davomat va h.k.). */
export function LineChart({
  labels, series, min = 0, max, height = 200, format = (v) => String(Math.round(v)), labelEvery = 1,
}: {
  labels: string[];
  series: LineSeries[];
  min?: number;
  max?: number;
  height?: number;
  format?: (v: number) => string;
  labelEvery?: number;
}) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const top = max ?? niceMax(Math.max(1, ...all));
  const W = 640, H = height, padL = 54, padR = 22, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = Math.max(1, labels.length - 1);
  const x = (i: number) => padL + (plotW * i) / n;
  const y = (v: number) => padT + plotH - ((v - min) / (top - min)) * plotH;
  const step = niceStep((top - min) / 4);
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= top + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
        aria-label={series.map((s) => `${s.name}: ${s.values.map((v, i) => `${labels[i]} ${v === null ? "—" : format(v)}`).join(", ")}`).join("; ")}
        onMouseLeave={() => setHover(null)}>
        <defs>
          {series.map((s, k) => (
            <linearGradient key={k} id={`${gid}-${k}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={TONE_VAR[s.tone]} stopOpacity="0.18" />
              <stop offset="1" stopColor={TONE_VAR[s.tone]} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v === min ? undefined : "3 4"} />
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{format(v)}</text>
          </g>
        ))}
        {labels.map((l, i) => ((i % labelEvery === 0 && labels.length - 1 - i >= labelEvery) || i === labels.length - 1) && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{l}</text>
        ))}
        {series.map((s, k) => {
          const d = path(s.values);
          const firstI = s.values.findIndex((v) => v !== null);
          const lastI = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v !== null);
          return (
            <g key={s.name}>
              {series.length === 1 && firstI >= 0 && !s.values.slice(firstI, lastI + 1).includes(null) && (
                <path d={`${d}L${x(lastI)},${y(min)}L${x(firstI)},${y(min)}Z`} fill={`url(#${gid}-${k})`} />
              )}
              <path d={d} fill="none" stroke={TONE_VAR[s.tone]} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => v !== null && (hover === i || s.values.length <= 14) && (
                <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 3} fill="var(--surface)" stroke={TONE_VAR[s.tone]} strokeWidth="2" />
              ))}
            </g>
          );
        })}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - plotW / n / 2} y={padT} width={plotW / n} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="var(--muted)" strokeDasharray="2 3" pointerEvents="none" />}
      </svg>
      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted">
        {hover !== null ? (
          <>
            <span className="font-semibold text-ink">{labels[hover]}</span>
            {series.map((s) => (
              <span key={s.name} className="flex items-center gap-1.5">
                <span className={cx("size-2 rounded-full", toneBg(s.tone))} />
                {s.name}: <b className="tabular text-ink">{s.values[hover] === null ? "—" : format(s.values[hover]!)}</b>
              </span>
            ))}
          </>
        ) : series.length > 1 ? (
          series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className={cx("size-2 rounded-full", toneBg(s.tone))} />
              {s.name}
            </span>
          ))
        ) : null}
      </div>
    </div>
  );
}

/** Gorizontal bo'laklangan chiziq (davomat tarkibi va h.k.). */
export function StackBar({ parts, className }: { parts: { value: number; tone: Tone; label: string }[]; className?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className={cx("flex h-2.5 overflow-hidden rounded-full bg-surface-2", className)} role="img"
      aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <div key={p.label} className={toneBg(p.tone)} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${p.value}`} />
      ))}
    </div>
  );
}

/** Kichik halqa: foiz ko'rsatkichi. */
export function Ring({ value, tone = "primary", size = 56, label }: { value: number | null; tone?: Tone; size?: number; label?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.min(1, Math.max(0, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TONE_VAR[tone]} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`} />
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center text-[13px] font-bold">{label ?? (value === null ? "—" : `${Math.round(v * 100)}%`)}</span>
    </div>
  );
}

/** Gorizontal ustunlar: uzun nomlar (fanlar, o'qituvchilar) uchun. */
export function HBars({ data, max }: { data: BarDatum[]; max?: number }) {
  const top = max ?? niceMax(Math.max(1, ...data.map((d) => d.value)));
  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm" title={d.hint}>
          <span className="truncate text-muted">{d.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, d.value / top)) * 100}%`, background: TONE_VAR[d.tone ?? "primary"] }} />
          </span>
          <span className="tabular text-right font-semibold">{d.display ?? d.value}</span>
        </li>
      ))}
    </ul>
  );
}
