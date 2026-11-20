// TTN uplink webhook -> Supabase.
//
// Deploy:  supabase functions deploy ttn-ingest --no-verify-jwt
// Secret:  supabase secrets set TTN_WEBHOOK_SECRET=<a long random string>
//
// --no-verify-jwt is required because TTN cannot send a Supabase JWT. The
// function authenticates the caller with its own shared-secret header instead.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

/** decoded_payload label -> readings column */
const FIELDS: Record<string, string> = {
  // sdi_0, ATMOS 41
  "air-temperature": "temperature_c",
  "relative-humidity": "humidity_pct",
  "vapour-pressure": "vapour_pressure_kpa",
  "windspeed": "wind_speed_ms",
  "gust-windspeed": "wind_gust_ms",
  "wind-direction": "wind_dir_deg",
  "precipitation": "rain_mm",
  "solar-radiation": "solar_w_m2",
  "strikes": "lightning_strikes",
  "strike-distance": "lightning_km",
  // sdi_1, barometer + tilt
  "atmospheric-pressure": "pressure_kpa",
  "x-orientation": "tilt_x_deg",
  "y-orientation": "tilt_y_deg",
  // logger
  "battery-voltage": "battery_v",
  "solar-voltage": "solar_v",
  "charging-state": "charging_state",
  "fault": "fault",
  "uptime": "uptime_s",
  "command": "sdi_cmd",
};

type Item = { label: string; value: unknown; unit?: string; source?: string };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const secret = Deno.env.get("TTN_WEBHOOK_SECRET") ?? "";
  const given = req.headers.get("x-webhook-secret") ?? "";
  if (!secret || !timingSafeEqual(given, secret)) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // The TTN console wraps events in { name, data: { ... } }. The webhook POSTs
  // the inner object directly. Accept either, so you can replay console JSON.
  const env = body.uplink_message ? body : body.data;
  const up = env?.uplink_message;

  // Join accepts, downlink events and the bare events with no payload all land
  // here harmlessly if the webhook is misconfigured. Ignore them.
  if (!up?.decoded_payload) {
    return new Response("no uplink payload, ignored", { status: 200 });
  }

  const items: Item[] = up.decoded_payload.data ?? [];
  if (items.find((d) => d.label === "packet-type")?.value !== "DATA_PACKET") {
    return new Response("not a data packet, ignored", { status: 200 });
  }

  const deviceId: string = env.end_device_ids.device_id;
  const best = (up.rx_metadata ?? [])
    .slice()
    .sort((a: any, b: any) => (b.rssi ?? -999) - (a.rssi ?? -999))[0];

  const row: Record<string, unknown> = {
    device_id: deviceId,
    time: up.received_at ?? env.received_at,
    f_cnt: up.f_cnt,
    rssi: best?.rssi ?? null,
    snr: best?.snr ?? null,
    raw: up.decoded_payload,
  };

  for (const item of items) {
    const column = FIELDS[item.label];
    if (column && typeof item.value === "number") row[column] = item.value;
  }

  // The sensor reports distance 0 when there were no strikes, which would
  // otherwise plot as "lightning directly overhead".
  if (row.lightning_strikes === 0) row.lightning_km = null;

  await supabase
    .from("devices")
    .upsert({ id: deviceId }, { onConflict: "id", ignoreDuplicates: true });

  // TTN retries on a non-2xx, so inserts must be idempotent.
  const { error } = await supabase
    .from("readings")
    .upsert(row, { onConflict: "device_id,time", ignoreDuplicates: true });

  if (error) {
    console.error("insert failed", error.message, { deviceId, f_cnt: up.f_cnt });
    return new Response(error.message, { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
