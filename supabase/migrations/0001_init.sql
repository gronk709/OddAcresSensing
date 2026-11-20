-- ATMOS 41 / TTN weather station schema
-- One row per uplink. The station splits a reading cycle across two uplinks
-- (sdi_0 = weather, sdi_1 = pressure + tilt), so most rows are partial and
-- many columns are null. Aggregates ignore nulls, so this costs nothing.

create table if not exists devices (
  id           text primary key,          -- TTN device_id, e.g. snodek104
  name         text,
  latitude     double precision,
  longitude    double precision,
  elevation_m  real,                      -- needed for sea-level pressure
  created_at   timestamptz not null default now()
);

create table if not exists readings (
  device_id             text not null references devices(id) on delete cascade,
  time                  timestamptz not null,   -- uplink_message.received_at
  f_cnt                 int,

  -- sdi_0: ATMOS 41 weather
  temperature_c         real,
  humidity_pct          real,
  vapour_pressure_kpa   real,
  wind_speed_ms         real,
  wind_gust_ms          real,
  wind_dir_deg          real,
  rain_mm               real,                   -- accumulation this interval
  solar_w_m2            real,
  lightning_strikes     int,
  lightning_km          real,

  -- sdi_1: barometer + tilt
  pressure_kpa          real,
  tilt_x_deg            real,
  tilt_y_deg            real,

  -- logger health
  battery_v             real,
  solar_v               real,
  charging_state        int,
  fault                 int,
  uptime_s              bigint,
  sdi_cmd               int,

  -- radio
  rssi                  int,
  snr                   real,

  raw                   jsonb,                  -- full decoded_payload

  primary key (device_id, time)
);

create index if not exists readings_device_time_idx
  on readings (device_id, time desc);

-- Partial index so "latest non-null weather" stays fast as history grows.
create index if not exists readings_weather_idx
  on readings (device_id, time desc)
  where temperature_c is not null;

-- ---------------------------------------------------------------------------
-- Current conditions: newest non-null value per column, across both uplinks.
-- ---------------------------------------------------------------------------
create or replace view latest_readings as
select
  device_id,
  max(time) as last_seen,
  (array_agg(temperature_c       order by time desc) filter (where temperature_c       is not null))[1] as temperature_c,
  (array_agg(humidity_pct        order by time desc) filter (where humidity_pct        is not null))[1] as humidity_pct,
  (array_agg(vapour_pressure_kpa order by time desc) filter (where vapour_pressure_kpa is not null))[1] as vapour_pressure_kpa,
  (array_agg(pressure_kpa        order by time desc) filter (where pressure_kpa        is not null))[1] as pressure_kpa,
  (array_agg(wind_speed_ms       order by time desc) filter (where wind_speed_ms       is not null))[1] as wind_speed_ms,
  (array_agg(wind_gust_ms        order by time desc) filter (where wind_gust_ms        is not null))[1] as wind_gust_ms,
  (array_agg(wind_dir_deg        order by time desc) filter (where wind_dir_deg        is not null))[1] as wind_dir_deg,
  (array_agg(solar_w_m2          order by time desc) filter (where solar_w_m2          is not null))[1] as solar_w_m2,
  (array_agg(battery_v           order by time desc) filter (where battery_v           is not null))[1] as battery_v,
  (array_agg(solar_v             order by time desc) filter (where solar_v             is not null))[1] as solar_v,
  (array_agg(charging_state      order by time desc) filter (where charging_state      is not null))[1] as charging_state,
  (array_agg(fault               order by time desc) filter (where fault               is not null))[1] as fault,
  (array_agg(tilt_x_deg          order by time desc) filter (where tilt_x_deg          is not null))[1] as tilt_x_deg,
  (array_agg(tilt_y_deg          order by time desc) filter (where tilt_y_deg          is not null))[1] as tilt_y_deg,
  (array_agg(rssi                order by time desc) filter (where rssi                is not null))[1] as rssi,
  (array_agg(snr                 order by time desc) filter (where snr                 is not null))[1] as snr,
  coalesce(sum(rain_mm) filter (where time > date_trunc('day', now())), 0) as rain_today_mm
from readings
where time > now() - interval '24 hours'
group by device_id;

alter view latest_readings set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table devices  enable row level security;
alter table readings enable row level security;

-- Public dashboard. Delete these two and require auth if it should be private.
drop policy if exists "anyone can read devices"  on devices;
drop policy if exists "anyone can read readings" on readings;
create policy "anyone can read devices"  on devices  for select using (true);
create policy "anyone can read readings" on readings for select using (true);

-- Writes are service-role only: no insert/update/delete policies exist, and
-- the service role bypasses RLS.

-- Live updates in the browser
alter publication supabase_realtime add table readings;

-- ---------------------------------------------------------------------------
-- Seed your station. Elevation is used for sea-level pressure; set it to the
-- actual mast elevation, not the gateway's.
-- ---------------------------------------------------------------------------
-- Set latitude, longitude and elevation_m with an UPDATE after applying; they
-- are deliberately not committed here.
insert into devices (id, name)
values ('snodek104', 'Carwoola Weather Station')
on conflict (id) do nothing;
