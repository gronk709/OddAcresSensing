"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, DEVICE_ID } from "@/lib/supabase";
import type { Current, Device, Reading } from "@/lib/types";
import {
  bin, clockTime, dayLabel, foldCurrent, kpaToHpa, mergeCurrent, msToKmh, num,
  seaLevelPressure, series, timeAgo, vpd,
} from "@/lib/format";
import NowBand from "./NowBand";
import TrendChart from "./TrendChart";
import RainBars from "./RainBars";
import WindRose from "./WindRose";
import StationHealth from "./StationHealth";

const RANGES = [6, 24, 48] as const;
type Range = (typeof RANGES)[number];

export default function Dashboard({
  initialRows, device, historyHours,
}: {
  initialRows: Reading[];
  device: Device | null;
  historyHours: number;
}) {
  const [rows, setRows] = useState<Reading[]>(initialRows);
  const [current, setCurrent] = useState<Current>(() => foldCurrent(initialRows));
  const [range, setRange] = useState<Range>(24);
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(false);
  const seen = useRef(new Set(initialRows.map((r) => r.time)));

  // Keep "x minutes ago" honest without re-rendering the whole tree constantly.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Live uplinks. Each one carries only half the fields, so merge rather than
  // replace, otherwise the temperature blanks out when a pressure packet lands.
  useEffect(() => {
    const channel = supabase
      .channel("readings-live")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "readings",
          filter: `device_id=eq.${DEVICE_ID}`,
        },
        (payload) => {
          const row = payload.new as Reading;
          if (seen.current.has(row.time)) return;
          seen.current.add(row.time);
          setRows((prev) => [...prev, row].sort((a, b) => a.time.localeCompare(b.time)));
          setCurrent((prev) => mergeCurrent(prev, row));
          setNow(Date.now());
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => { void supabase.removeChannel(channel); };
  }, []);

  const windowRows = useMemo(() => {
    const cutoff = now - range * 3600_000;
    return rows.filter((r) => new Date(r.time).getTime() >= cutoff);
  }, [rows, range, now]);

  const elevation = device?.elevation_m ?? 0;

  /* --------------------------------------------------------- derived values */

  const pressureHpa =
    typeof current.pressure_kpa === "number"
      ? kpaToHpa(
          elevation
            ? seaLevelPressure(current.pressure_kpa, current.temperature_c ?? 15, elevation)
            : current.pressure_kpa,
        )
      : null;

  // Three-hour tendency is the part of pressure that actually forecasts weather.
  const tendency = useMemo(() => {
    const points = series(rows, "pressure_kpa");
    if (points.length < 2) return null;
    const latest = points[points.length - 1];
    const target = latest.time - 3 * 3600_000;
    const earlier = points.find((p) => p.time >= target);
    if (!earlier || latest.time - earlier.time < 2 * 3600_000) return null;
    return kpaToHpa(latest.value - earlier.value);
  }, [rows]);

  const currentVpd =
    typeof current.temperature_c === "number" && typeof current.vapour_pressure_kpa === "number"
      ? vpd(current.temperature_c, current.vapour_pressure_kpa)
      : null;

  const rainWindow = useMemo(
    () => bin(windowRows, "rain_mm", 3600_000, "sum"),
    [windowRows],
  );
  // Rain since local midnight, using the configured display timezone.
  const rainToday = useMemo(() => {
    const today = dayLabel(new Date(now).toISOString());
    return rows.reduce(
      (sum, r) => (dayLabel(r.time) === today ? sum + (r.rain_mm ?? 0) : sum),
      0,
    );
  }, [rows, now]);

  const strikes = windowRows.reduce((sum, r) => sum + (r.lightning_strikes ?? 0), 0);
  const nearestStrike = windowRows
    .map((r) => r.lightning_km)
    .filter((d): d is number => typeof d === "number" && d > 0)
    .sort((a, b) => a - b)[0];

  const solarPeak = Math.max(0, ...windowRows.map((r) => r.solar_w_m2 ?? 0));

  const stale =
    !current.last_seen || now - new Date(current.last_seen).getTime() > 45 * 60_000;

  /* ------------------------------------------------------------------ empty */

  if (!rows.length) {
    return (
      <main className="page">
        <div className="empty">
          <h1>Waiting for the first uplink</h1>
          <p>
            Nothing has arrived for <code>{DEVICE_ID}</code> in the last {historyHours} hours.
            Send a test uplink from the TTN console and check the function logs with{" "}
            <code>supabase functions logs ttn-ingest</code>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="masthead">
        <h1>{device?.name ?? "Weather station"}</h1>
        <p className="station-meta">
          <span className={`pulse ${connected && !stale ? "live" : "stale"}`} aria-hidden />
          {stale ? "No recent uplink, " : ""}
          updated {timeAgo(current.last_seen, now)}
          {current.last_seen ? ` at ${clockTime(current.last_seen)}` : ""}
        </p>
      </header>

      <NowBand current={current} />

      <div className="range" style={{ marginTop: "1.25rem" }} role="group" aria-label="Time range">
        {RANGES.map((hours) => (
          <button
            key={hours}
            type="button"
            aria-pressed={range === hours}
            onClick={() => setRange(hours)}
          >
            {hours} h
          </button>
        ))}
      </div>

      <div className="grid">
        <TrendChart
          title="Temperature"
          note={`Last ${range} hours`}
          unit="°C"
          hue="var(--temperature)"
          traces={[{ points: series(windowRows, "temperature_c"), color: "var(--temperature)", label: "Air" }]}
        />

        <section className="tile" style={{ ["--tile-hue" as string]: "var(--pressure)" }}>
          <h2>Pressure</h2>
          <p className="tile-note">
            {elevation ? `Reduced to sea level from ${num(elevation, 0)} m` : "At the station"}
          </p>
          <div className="tile-value">
            {num(pressureHpa, 1)}<small>hPa</small>
          </div>
          <p className="tile-note" style={{ margin: "0.6rem 0 0" }}>
            {tendency === null
              ? "Tendency appears after three hours of readings."
              : Math.abs(tendency) < 0.5
                ? "Steady over the last three hours."
                : `${tendency > 0 ? "Rising" : "Falling"} ${num(Math.abs(tendency), 1)} hPa over three hours.`}
          </p>
        </section>

        <TrendChart
          title="Wind"
          note={`Mean and gust, last ${range} hours`}
          unit=" km/h"
          hue="var(--wind)"
          digits={0}
          zeroBased
          traces={[
            {
              points: series(windowRows, "wind_speed_ms").map((p) => ({ ...p, value: msToKmh(p.value) })),
              color: "var(--wind)",
              label: "Mean",
            },
            {
              points: series(windowRows, "wind_gust_ms").map((p) => ({ ...p, value: msToKmh(p.value) })),
              color: "var(--wind)",
              label: "Gust",
              dashed: true,
            },
          ]}
        />

        <WindRose rows={windowRows} hours={range} />

        <RainBars bins={rainWindow} hours={range} />

        <section className="tile" style={{ ["--tile-hue" as string]: "var(--rain)" }}>
          <h2>Rain since midnight</h2>
          <p className="tile-note">Local day</p>
          <div className="tile-value">
            {num(rainToday, 1)}<small>mm</small>
          </div>
        </section>

        <TrendChart
          title="Solar radiation"
          note={`Peak ${num(solarPeak, 0)} W/m² in the last ${range} hours`}
          unit=" W/m²"
          hue="var(--solar)"
          digits={0}
          zeroBased
          traces={[{ points: series(windowRows, "solar_w_m2"), color: "var(--solar)", label: "Incoming" }]}
        />

        <section className="tile" style={{ ["--tile-hue" as string]: "var(--solar)" }}>
          <h2>Drying power</h2>
          <p className="tile-note">Vapour pressure deficit</p>
          <div className="tile-value">
            {num(currentVpd, 2)}<small>kPa</small>
          </div>
          <p className="tile-note" style={{ margin: "0.6rem 0 0" }}>
            {currentVpd === null
              ? "Needs temperature and vapour pressure."
              : currentVpd < 0.4
                ? "Air is close to saturated, so very little evaporation."
                : currentVpd < 1.2
                  ? "Moderate evaporative demand."
                  : "High evaporative demand."}
          </p>
        </section>

        <section className="tile" style={{ ["--tile-hue" as string]: strikes ? "var(--lightning)" : "var(--muted)" }}>
          <h2>Lightning</h2>
          <p className="tile-note">Last {range} hours</p>
          <div className="tile-value">
            {strikes}<small>{strikes === 1 ? "strike" : "strikes"}</small>
          </div>
          <p className="tile-note" style={{ margin: "0.6rem 0 0" }}>
            {strikes === 0
              ? "No strikes detected."
              : nearestStrike
                ? `Nearest ${num(nearestStrike, 0)} km away.`
                : "Distance not reported."}
          </p>
        </section>

        <StationHealth current={current} now={now} />
      </div>
    </main>
  );
}
