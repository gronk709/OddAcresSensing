import type { Current, Reading } from "./types";
import { TIMEZONE } from "./supabase";

/* ------------------------------------------------------------------ units */

export const kpaToHpa = (kpa: number) => kpa * 10;
export const msToKmh = (ms: number) => ms * 3.6;

const POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

export function compassPoint(deg: number): string {
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/* ------------------------------------------------------- derived measures */

/** Saturation vapour pressure, kPa (Magnus-Tetens). */
export function saturationVapourPressure(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/** Dew point in °C from actual vapour pressure in kPa. */
export function dewPoint(vapourKpa: number): number | null {
  if (vapourKpa <= 0) return null;
  const ln = Math.log(vapourKpa / 0.6108);
  return (237.3 * ln) / (17.27 - ln);
}

/** Vapour pressure deficit in kPa. Drives evaporation and nectar drying. */
export function vpd(tempC: number, vapourKpa: number): number {
  return Math.max(0, saturationVapourPressure(tempC) - vapourKpa);
}

/**
 * Apparent temperature, the Bureau of Meteorology formula.
 * Uses vapour pressure directly, which the station reports.
 */
export function apparentTemperature(
  tempC: number,
  vapourKpa: number,
  windMs: number,
): number {
  const vapourHpa = vapourKpa * 10; // the formula takes hPa
  return tempC + 0.33 * vapourHpa - 0.7 * windMs - 4.0;
}

/** Reduce station pressure to sea level, kPa. */
export function seaLevelPressure(
  pressureKpa: number,
  tempC: number,
  elevationM: number,
): number {
  const t = tempC + 273.15;
  return pressureKpa * Math.pow(1 - (0.0065 * elevationM) / (t + 0.0065 * elevationM), -5.257);
}

/* --------------------------------------------------------- current fold-up */

/**
 * The station splits one reading cycle across two uplinks, so any single row
 * is half empty. Fold forward over time-ascending rows, keeping the newest
 * non-null value of every field.
 */
export function foldCurrent(rows: Reading[]): Current {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (value !== null && value !== undefined && field !== "time") {
        out[field] = value;
      }
    }
  }
  out.last_seen = rows.length ? rows[rows.length - 1].time : null;
  return out as Current;
}

/** Merge one newly arrived row into the current conditions. */
export function mergeCurrent(current: Current, row: Reading): Current {
  const out: Record<string, unknown> = { ...current };
  for (const [field, value] of Object.entries(row)) {
    if (value !== null && value !== undefined && field !== "time") {
      out[field] = value;
    }
  }
  if (!current.last_seen || row.time > current.last_seen) out.last_seen = row.time;
  return out as Current;
}

/* ------------------------------------------------------------------- time */

const timeFmt = new Intl.DateTimeFormat("en-AU", {
  hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIMEZONE,
});
const dayFmt = new Intl.DateTimeFormat("en-AU", {
  weekday: "short", day: "numeric", month: "short", timeZone: TIMEZONE,
});

export const clockTime = (iso: string) => timeFmt.format(new Date(iso));
export const dayLabel = (iso: string) => dayFmt.format(new Date(iso));

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "no data";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function uptimeLabel(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

/** Number with fixed decimals, or an em dash when the value is missing. */
export function num(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || Number.isNaN(value)
    ? "—"
    : value.toFixed(digits);
}

/* ---------------------------------------------------------------- binning */

export type Bin = { time: number; value: number };

/** Bucket rows into fixed intervals, aggregating with sum, mean or max. */
export function bin(
  rows: Reading[],
  field: keyof Reading,
  intervalMs: number,
  how: "sum" | "mean" | "max" = "mean",
): Bin[] {
  const buckets = new Map<number, number[]>();
  for (const row of rows) {
    const value = row[field];
    if (typeof value !== "number") continue;
    const key = Math.floor(new Date(row.time).getTime() / intervalMs) * intervalMs;
    const list = buckets.get(key);
    if (list) list.push(value);
    else buckets.set(key, [value]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, values]) => ({
      time,
      value:
        how === "sum" ? values.reduce((a, b) => a + b, 0)
        : how === "max" ? Math.max(...values)
        : values.reduce((a, b) => a + b, 0) / values.length,
    }));
}

/** Time-ordered points for a line chart, skipping rows missing that field. */
export function series(rows: Reading[], field: keyof Reading): Bin[] {
  const out: Bin[] = [];
  for (const row of rows) {
    const value = row[field];
    if (typeof value === "number") out.push({ time: new Date(row.time).getTime(), value });
  }
  return out;
}
