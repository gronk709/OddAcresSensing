"use client";

import { useRef, useState } from "react";
import type { Bin } from "@/lib/format";
import { clockTime, num } from "@/lib/format";

const W = 720;
const H = 210;
const PAD = { top: 12, right: 10, bottom: 24, left: 42 };

export type Trace = { points: Bin[]; color: string; label: string; dashed?: boolean };

type Props = {
  title: string;
  note?: string;
  unit: string;
  hue: string;
  traces: Trace[];
  digits?: number;
  /** Force the y axis to start at zero, for quantities where zero is meaningful. */
  zeroBased?: boolean;
};

export default function TrendChart({
  title, note, unit, hue, traces, digits = 1, zeroBased = false,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);

  const all = traces.flatMap((t) => t.points);
  if (all.length < 2) {
    return (
      <section className="tile wide" style={{ ["--tile-hue" as string]: hue }}>
        <h2>{title}</h2>
        <p className="tile-note">Not enough readings yet to draw a line.</p>
      </section>
    );
  }

  const t0 = Math.min(...all.map((p) => p.time));
  const t1 = Math.max(...all.map((p) => p.time));
  const values = all.map((p) => p.value);
  let lo = zeroBased ? 0 : Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1e-6) { hi = lo + 1; }
  const headroom = (hi - lo) * 0.12;
  lo = zeroBased ? 0 : lo - headroom;
  hi = hi + headroom;

  const x = (t: number) =>
    PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) =>
    H - PAD.bottom - ((v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  const path = (points: Bin[]) =>
    points.map((p, i) => `${i ? "L" : "M"}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join("");

  // Four horizontal gridlines, labelled.
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);

  // Time labels at both ends and the midpoint.
  const timeTicks = [t0, (t0 + t1) / 2, t1];

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * W;
    const ratio = (svgX - PAD.left) / (W - PAD.left - PAD.right);
    setCursor(Math.min(1, Math.max(0, ratio)) * (t1 - t0) + t0);
  };

  const nearest = (points: Bin[]) => {
    if (cursor === null || !points.length) return null;
    return points.reduce((best, p) =>
      Math.abs(p.time - cursor) < Math.abs(best.time - cursor) ? p : best,
    );
  };

  const readout = cursor === null
    ? traces.map((t) => ({ label: t.label, point: t.points.at(-1) ?? null, color: t.color }))
    : traces.map((t) => ({ label: t.label, point: nearest(t.points), color: t.color }));

  const stamp = cursor !== null
    ? clockTime(new Date(cursor).toISOString())
    : clockTime(new Date(t1).toISOString());

  return (
    <section className="tile wide" style={{ ["--tile-hue" as string]: hue }}>
      <div className="chart-head">
        <div>
          <h2>{title}</h2>
          {note ? <p className="tile-note" style={{ marginBottom: 0 }}>{note}</p> : null}
        </div>
        <div className="chart-readout">
          {readout.map((r) => (
            <span key={r.label} style={{ color: r.color, marginLeft: "0.75rem" }}>
              {r.label} {num(r.point?.value ?? null, digits)}{unit}
            </span>
          ))}
          <span style={{ color: "var(--muted)", marginLeft: "0.75rem", fontWeight: 500 }}>
            {stamp}
          </span>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title} over the selected period`}
        onPointerMove={onMove}
        onPointerLeave={() => setCursor(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line className="gridline" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="axis" x={0} y={y(v) + 4}>{num(v, digits === 0 ? 0 : 1)}</text>
          </g>
        ))}

        {timeTicks.map((t, i) => (
          <text
            key={t}
            className="axis"
            x={x(t)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
          >
            {clockTime(new Date(t).toISOString())}
          </text>
        ))}

        {traces.map((t) => (
          <path
            key={t.label}
            className="trace"
            d={path(t.points)}
            stroke={t.color}
            strokeDasharray={t.dashed ? "4 4" : undefined}
          />
        ))}

        {cursor !== null && (
          <>
            <line className="cursor" x1={x(cursor)} x2={x(cursor)} y1={PAD.top} y2={H - PAD.bottom} />
            {readout.map((r) =>
              r.point ? (
                <circle key={r.label} cx={x(r.point.time)} cy={y(r.point.value)} r={3.5} fill={r.color} />
              ) : null,
            )}
          </>
        )}
      </svg>
    </section>
  );
}
