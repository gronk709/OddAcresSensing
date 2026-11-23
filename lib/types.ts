export type Reading = {
  device_id: string;
  time: string;
  f_cnt: number | null;

  temperature_c: number | null;
  humidity_pct: number | null;
  vapour_pressure_kpa: number | null;
  wind_speed_ms: number | null;
  wind_gust_ms: number | null;
  wind_dir_deg: number | null;
  rain_mm: number | null;
  solar_w_m2: number | null;
  lightning_strikes: number | null;
  lightning_km: number | null;

  pressure_kpa: number | null;
  tilt_x_deg: number | null;
  tilt_y_deg: number | null;

  battery_v: number | null;
  solar_v: number | null;
  charging_state: number | null;
  fault: number | null;
  uptime_s: number | null;
  sdi_cmd: number | null;

  rssi: number | null;
  snr: number | null;
};

export type Device = {
  id: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation_m: number | null;
};

export type LocationOption = { id: string; name: string; slug: string; deviceId: string };

/** Current conditions assembled from the most recent non-null value of each field. */
export type Current = Omit<Partial<Reading>, "time"> & { last_seen: string | null };

export const READING_COLUMNS = [
  "device_id", "time", "f_cnt",
  "temperature_c", "humidity_pct", "vapour_pressure_kpa",
  "wind_speed_ms", "wind_gust_ms", "wind_dir_deg",
  "rain_mm", "solar_w_m2", "lightning_strikes", "lightning_km",
  "pressure_kpa", "tilt_x_deg", "tilt_y_deg",
  "battery_v", "solar_v", "charging_state", "fault", "uptime_s", "sdi_cmd",
  "rssi", "snr",
].join(",");
