"use client";

import type { Reading } from "@/lib/types";
import { msToKmh, num } from "@/lib/format";

const SIZE = 300;
const C = SIZE / 2;
const R = 118;

/** Speed bands in m/s, light to strong. Colours are a sequential ramp defined in globals.css. */
const BANDS = [
  { max: 2, label: "Under 2", color: "var(--rose-1)" },
  { max: 4, label: "2–4", color: "var(--rose-2)" },
  { max: 8, label: "4–8", color: "var(--rose-3)" },
  { max: 12, label: "8–12", color: "var(--rose-4)" },
  { max: 20, label: "12–20", color: "var(--rose-5)" },
  { max: Infinity, label: "Over 20", color: "var(--rose-6)" },
];

const SECTORS = 16;
const STEP = 360 / SECTORS;

function arc(cx: number, cy: number, inner: number, outer: number, from: number, to: number) {
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const p = (r: number, deg: number) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
  const [x1, y1] = p(outer, from);
  const [x2, y2] = p(outer, to);
  const [x3, y3] = p(inner, to);
  const [x4, y4] = p(inner, from);
  return `M${x1},${y1}A${outer},${outer} 0 0 1 ${x2},${y2}L${x3},${y3}A${inner},${inner} 0 0 0 ${x4},${y4}Z`;
}

export default function WindRose({ rows, hours }: { rows: Reading[]; hours: number }) {
  // counts[sector][band]
  const counts: number[][] = Array.from({ length: SECTORS }, () => BANDS.map(() => 0));
  let calm = 0;
  let total = 0;

  for (const row of rows) {
    const speed = row.wind_speed_ms;
    const dir = row.wind_dir_deg;
    if (typeof speed !== "number" || typeof dir !== "number") continue;
    total++;
    if (speed < 0.3) { calm++; continue; }
    const sector = Math.round((((dir % 360) + 360) % 360) / STEP) % SECTORS;
    const band = BANDS.findIndex((b) => speed < b.max);
    counts[sector][band === -1 ? BANDS.length - 1 : band]++;
  }

  const sectorTotals = counts.map((bands) => bands.reduce((a, b) => a + b, 0));
  const peak = Math.max(1, ...sectorTotals);
  const calmPct = total ? (calm / total) * 100 : 0;

  return (
    <section className="tile" style={{ ["--tile-hue" as string]: "var(--wind)" }}>
      <h2>Where the wind came from</h2>
      <p className="tile-note">Last {hours} hours, by direction and strength</p>

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="chart" role="img"
           aria-label="Wind rose showing the distribution of wind direction and speed">
        {[0.33, 0.66, 1].map((f) => (
          <circle key={f} className="rose-ring" cx={C} cy={C} r={R * f} />
        ))}

        {counts.map((bands, sector) => {
          const from = sector * STEP - STEP / 2;
          const to = sector * STEP + STEP / 2;
          let inner = 14;
          return bands.map((count, band) => {
            if (!count) return null;
            const outer = inner + (count / peak) * (R - 14);
            const d = arc(C, C, inner, outer, from + 1.5, to - 1.5);
            inner = outer;
            return (
              <path
                key={`${sector}-${band}`}
                className="rose-petal"
                d={d}
                fill={BANDS[band].color}
              />
            );
          });
        })}

        <text className="rose-label" x={C} y={14}>N</text>
        <text className="rose-label" x={SIZE - 8} y={C + 4}>E</text>
        <text className="rose-label" x={C} y={SIZE - 4}>S</text>
        <text className="rose-label" x={10} y={C + 4}>W</text>
      </svg>

      <table className="readout" style={{ marginTop: "0.75rem" }}>
        <tbody>
          {BANDS.map((band, i) => (
            <tr key={band.label}>
              <th>
                <span
                  aria-hidden
                  style={{
                    display: "inline-block", width: 10, height: 10, marginRight: 6,
                    background: band.color,
                  }}
                />
                {band.label} m/s
              </th>
              <td>{counts.reduce((sum, bands) => sum + bands[i], 0)}</td>
            </tr>
          ))}
          <tr>
            <th>Calm</th>
            <td>{num(calmPct, 0)}%</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export function windSummary(speedMs: number | null | undefined) {
  if (typeof speedMs !== "number") return "—";
  return `${num(msToKmh(speedMs), 0)} km/h`;
}
