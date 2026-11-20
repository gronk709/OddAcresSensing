"use client";

import type { Bin } from "@/lib/format";
import { clockTime, num } from "@/lib/format";

const W = 720;
const H = 180;
const PAD = { top: 12, right: 10, bottom: 24, left: 42 };

export default function RainBars({ bins, hours }: { bins: Bin[]; hours: number }) {
  const total = bins.reduce((sum, b) => sum + b.value, 0);

  if (!bins.length) {
    return (
      <section className="tile wide" style={{ ["--tile-hue" as string]: "var(--rain)" }}>
        <h2>Rainfall</h2>
        <p className="tile-note">No readings in this period.</p>
      </section>
    );
  }

  if (total === 0) {
    return (
      <section className="tile wide" style={{ ["--tile-hue" as string]: "var(--rain)" }}>
        <h2>Rainfall</h2>
        <p className="tile-note">
          Dry for the last {hours} hours. Bars appear here as soon as the gauge tips.
        </p>
      </section>
    );
  }

  const t0 = bins[0].time;
  const t1 = bins[bins.length - 1].time;
  const peak = Math.max(...bins.map((b) => b.value));
  const spanMs = Math.max(3600_000, t1 - t0);
  const barWidth = Math.max(2, ((W - PAD.left - PAD.right) / (spanMs / 3600_000 + 1)) * 0.75);

  const x = (t: number) => PAD.left + ((t - t0) / spanMs) * (W - PAD.left - PAD.right - barWidth);
  const h = (v: number) => (v / peak) * (H - PAD.top - PAD.bottom);

  return (
    <section className="tile wide" style={{ ["--tile-hue" as string]: "var(--rain)" }}>
      <div className="chart-head">
        <div>
          <h2>Rainfall</h2>
          <p className="tile-note" style={{ marginBottom: 0 }}>Per hour</p>
        </div>
        <div className="chart-readout">
          {num(total, 1)} mm over {hours} h
        </div>
      </div>

      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hourly rainfall">
        <line className="gridline" x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} />
        <text className="axis" x={0} y={PAD.top + 4}>{num(peak, 1)}</text>
        <text className="axis" x={0} y={H - PAD.bottom + 4}>0</text>

        {bins.map((b) => (
          <rect
            key={b.time}
            className="bar"
            x={x(b.time)}
            y={H - PAD.bottom - h(b.value)}
            width={barWidth}
            height={Math.max(b.value > 0 ? 1.5 : 0, h(b.value))}
          >
            <title>{`${clockTime(new Date(b.time).toISOString())} — ${num(b.value, 1)} mm`}</title>
          </rect>
        ))}

        <text className="axis" x={PAD.left} y={H - 6} textAnchor="start">
          {clockTime(new Date(t0).toISOString())}
        </text>
        <text className="axis" x={W - PAD.right} y={H - 6} textAnchor="end">
          {clockTime(new Date(t1).toISOString())}
        </text>
      </svg>
    </section>
  );
}
