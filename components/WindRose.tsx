"use client";

import type { Reading } from "@/lib/types";
import { msToKmh, num } from "@/lib/format";

const SIZE = 300;
const C = SIZE / 2;
const R = 118;
const INNER = 14;

/** Speed bands in km/h, light to strong. Colours are a sequential ramp defined in globals.css. */
const BANDS = [
  { max: 10, label: "Under 10", color: "var(--rose-1)" },
  { max: 20, label: "10–20", color: "var(--rose-2)" },
  { max: 30, label: "20–30", color: "var(--rose-3)" },
  { max: 45, label: "30–45", color: "var(--rose-4)" },
  { max: 70, label: "45–70", color: "var(--rose-5)" },
  { max: Infinity, label: "Over 70", color: "var(--rose-6)" },
];

/** Readings from the latest RECENT_HOURS of data are outlined; older ones are dimmed. */
const RECENT_HOURS = 2;

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
  // counts[sector][band], split into older and recent readings
  const blank = () => Array.from({ length: SECTORS }, () => BANDS.map(() => 0));
  const older = blank();
  const recent = blank();
  let calm = 0;
  let total = 0;

  const latest = rows.reduce((m, r) => Math.max(m, new Date(r.time).getTime()), 0);
  const cutoff = latest - RECENT_HOURS * 3600_000;

  for (const row of rows) {
    const speed = row.wind_speed_ms;
    const dir = row.wind_dir_deg;
    if (typeof speed !== "number" || typeof dir !== "number") continue;
    total++;
    if (speed < 0.3) { calm++; continue; }
    const sector = Math.round((((dir % 360) + 360) % 360) / STEP) % SECTORS;
    const found = BANDS.findIndex((b) => msToKmh(speed) < b.max);
    const band = found === -1 ? BANDS.length - 1 : found;
    (new Date(row.time).getTime() > cutoff ? recent : older)[sector][band]++;
  }

  const counts = older.map((bands, s) => bands.map((n, b) => n + recent[s][b]));

  const sectorTotals = counts.map((bands) => bands.reduce((a, b) => a + b, 0));
  const peakPct = total ? (Math.max(...sectorTotals) / total) * 100 : 0;
  // Three rings at whole steps of a "nice" percentage, so the outer ring is
  // at or just beyond the busiest direction.
  const STEPS = [0.5, 1, 2, 2.5, 5, 10, 20, 25];
  const ringStep = STEPS.find((v) => v * 3 >= peakPct) ?? 25;
  const scaleMax = ringStep * 3;
  const ringRadius = (pct: number) => INNER + (pct / scaleMax) * (R - INNER);
  const calmPct = total ? (calm / total) * 100 : 0;

  return (
    <section className="tile" style={{ ["--tile-hue" as string]: "var(--wind)" }}>
      <h2>Where the wind came from</h2>
      <p className="tile-note" style={{ marginBottom: "0.25rem" }}>
        Last {hours} hours, by direction and strength.
      </p>
      <p className="tile-note" style={{ marginBottom: "0.25rem" }}>
        <span style={{ outline: "1.25px solid var(--ink)", outlineOffset: 1, padding: "0 3px" }}>
          Outlined
        </span>{" "}
        = latest {RECENT_HOURS} hours of readings
      </p>
      <p className="tile-note">
        Rings show the share of all readings (calm included) that came from each
        direction. Petal length is how often, not how strong; colour shows speed.
      </p>

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="chart" role="img"
           aria-label="Wind rose showing the distribution of wind direction and speed">
        {[1, 2, 3].map((i) => (
          <circle key={i} className="rose-ring" cx={C} cy={C} r={ringRadius(ringStep * i)} />
        ))}
        {[1, 2, 3].map((i) => (
          <text
            key={i}
            className="rose-label"
            x={C + 3}
            y={C - ringRadius(ringStep * i) - 2}
            textAnchor="start"
            style={{ fontSize: 9 }}
          >
            {ringStep * i}%
          </text>
        ))}

        {counts.map((bands, sector) => {
          const from = sector * STEP - STEP / 2;
          const to = sector * STEP + STEP / 2;
          let inner = INNER;
          return bands.flatMap((_, band) =>
            ([["old", older[sector][band]], ["new", recent[sector][band]]] as const).map(
              ([age, count]) => {
                if (!count) return null;
                const outer = inner + ((count / total) * 100 / scaleMax) * (R - INNER);
                const d = arc(C, C, inner, outer, from + 1.5, to - 1.5);
                inner = outer;
                const isNew = age === "new";
                return (
                  <path
                    key={`${sector}-${band}-${age}`}
                    className="rose-petal"
                    d={d}
                    fill={BANDS[band].color}
                    opacity={isNew ? 1 : 0.5}
                    style={isNew ? { stroke: "var(--ink)", strokeWidth: 1.25 } : undefined}
                  />
                );
              },
            ),
          );
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
                {band.label} km/h
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
