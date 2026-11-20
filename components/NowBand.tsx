"use client";

import type { Current } from "@/lib/types";
import {
  apparentTemperature, compassPoint, dewPoint, msToKmh, num,
} from "@/lib/format";

/** Compass with a needle pointing at the direction the wind is blowing from. */
function Compass({ bearing, speedMs }: { bearing: number | null; speedMs: number | null }) {
  const calm = speedMs !== null && speedMs < 0.3;
  const rotation = bearing ?? 0;

  return (
    <figure style={{ margin: 0, textAlign: "center" }}>
      <svg width="148" height="148" viewBox="0 0 148 148" role="img"
           aria-label={
             bearing === null ? "Wind direction unavailable"
             : calm ? "Calm"
             : `Wind from ${compassPoint(bearing)}, ${num(msToKmh(speedMs ?? 0), 0)} kilometres per hour`
           }>
        <circle cx="74" cy="74" r="62" fill="none" stroke="var(--rule)" strokeWidth="1" />
        {Array.from({ length: 16 }, (_, i) => {
          const angle = ((i * 22.5 - 90) * Math.PI) / 180;
          const major = i % 4 === 0;
          const r1 = major ? 52 : 57;
          return (
            <line
              key={i}
              x1={74 + r1 * Math.cos(angle)} y1={74 + r1 * Math.sin(angle)}
              x2={74 + 62 * Math.cos(angle)} y2={74 + 62 * Math.sin(angle)}
              stroke="var(--rule)" strokeWidth={major ? 1.5 : 1}
            />
          );
        })}
        <text x="74" y="22" className="rose-label">N</text>

        {bearing === null || calm ? (
          <circle cx="74" cy="74" r="7" fill="var(--muted)" />
        ) : (
          <g className="needle" style={{ transform: `rotate(${rotation}deg)` }}>
            {/* The tail points outward toward the source of the wind. */}
            <path d="M74 20 L80 42 L74 38 L68 42 Z" fill="var(--wind)" />
            <line x1="74" y1="38" x2="74" y2="106" stroke="var(--wind)" strokeWidth="2" />
            <circle cx="74" cy="74" r="4" fill="var(--wind)" />
          </g>
        )}
      </svg>
      <figcaption className="station-meta" style={{ marginTop: "0.35rem" }}>
        {bearing === null
          ? "No wind reading"
          : calm
            ? "Calm"
            : `From ${compassPoint(bearing)} at ${num(msToKmh(speedMs ?? 0), 0)} km/h`}
      </figcaption>
    </figure>
  );
}

export default function NowBand({ current }: { current: Current }) {
  const temp = current.temperature_c ?? null;
  const vapour = current.vapour_pressure_kpa ?? null;
  const wind = current.wind_speed_ms ?? null;
  const gust = current.wind_gust_ms ?? null;
  const humidity = current.humidity_pct ?? null;

  const dew = vapour !== null ? dewPoint(vapour) : null;
  const feels =
    temp !== null && vapour !== null && wind !== null
      ? apparentTemperature(temp, vapour, wind)
      : null;

  return (
    <div className="now">
      <div>
        <div className="now-reading">
          {num(temp, 1)}
          <span className="now-unit">°C</span>
        </div>
        <div className="now-secondary">
          {feels !== null && Math.abs(feels - (temp ?? 0)) >= 1 && (
            <span>Feels like <b>{num(feels, 1)}°C</b></span>
          )}
          <span>Humidity <b>{num(humidity, 0)}%</b></span>
          {dew !== null && <span>Dew point <b>{num(dew, 1)}°C</b></span>}
          {gust !== null && <span>Gusting <b>{num(msToKmh(gust), 0)} km/h</b></span>}
        </div>
      </div>
      <Compass bearing={current.wind_dir_deg ?? null} speedMs={wind} />
    </div>
  );
}
