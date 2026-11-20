-- Optional. Apply this once you have a few weeks of data and want month or
-- year views to stay fast. Until then the dashboard reads `readings` directly.

create table if not exists readings_hourly (
  device_id        text not null references devices(id) on delete cascade,
  hour             timestamptz not null,
  temperature_min  real,
  temperature_avg  real,
  temperature_max  real,
  humidity_avg     real,
  pressure_avg     real,
  wind_avg_ms      real,
  wind_max_ms      real,
  gust_max_ms      real,
  solar_avg_w_m2   real,
  solar_max_w_m2   real,
  rain_mm          real,
  strikes          int,
  samples          int,
  primary key (device_id, hour)
);

alter table readings_hourly enable row level security;
drop policy if exists "anyone can read hourly" on readings_hourly;
create policy "anyone can read hourly" on readings_hourly for select using (true);

-- Recompute a trailing window. Safe to run repeatedly.
create or replace function roll_up_readings(window_hours int default 3)
returns void
language sql
security definer
set search_path = public
as $$
  insert into readings_hourly as h
  select
    device_id,
    date_trunc('hour', time)        as hour,
    min(temperature_c), avg(temperature_c), max(temperature_c),
    avg(humidity_pct),
    avg(pressure_kpa),
    avg(wind_speed_ms), max(wind_speed_ms), max(wind_gust_ms),
    avg(solar_w_m2),    max(solar_w_m2),
    sum(rain_mm),
    sum(lightning_strikes),
    count(*)
  from readings
  where time >= date_trunc('hour', now()) - make_interval(hours => window_hours)
  group by device_id, date_trunc('hour', time)
  on conflict (device_id, hour) do update set
    temperature_min = excluded.temperature_min,
    temperature_avg = excluded.temperature_avg,
    temperature_max = excluded.temperature_max,
    humidity_avg    = excluded.humidity_avg,
    pressure_avg    = excluded.pressure_avg,
    wind_avg_ms     = excluded.wind_avg_ms,
    wind_max_ms     = excluded.wind_max_ms,
    gust_max_ms     = excluded.gust_max_ms,
    solar_avg_w_m2  = excluded.solar_avg_w_m2,
    solar_max_w_m2  = excluded.solar_max_w_m2,
    rain_mm         = excluded.rain_mm,
    strikes         = excluded.strikes,
    samples         = excluded.samples;
$$;

-- Schedule it. Enable the pg_cron extension in the Supabase dashboard first.
-- select cron.schedule('roll-up-readings', '7 * * * *', $$select roll_up_readings(3)$$);

-- Retention. Only turn this on once rollups have been running for a while,
-- because it is not reversible.
-- select cron.schedule('prune-readings', '30 3 * * *',
--   $$delete from readings where time < now() - interval '180 days'$$);
