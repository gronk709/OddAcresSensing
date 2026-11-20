-- Multiple apiary locations, hives, and hive sensor readings.
-- Builds on 0001: a device is now either a weather station or a hive sensor,
-- and belongs to a location (and, for hive sensors, a specific hive).

create table if not exists locations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  latitude     double precision,
  longitude    double precision,
  elevation_m  real,
  created_at   timestamptz not null default now()
);

create table if not exists hives (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references locations(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now(),
  unique (location_id, name)
);

alter table devices
  add column if not exists kind        text not null default 'weather'
    check (kind in ('weather', 'hive')),
  add column if not exists location_id uuid references locations(id) on delete set null,
  add column if not exists hive_id     uuid references hives(id) on delete set null;

create index if not exists devices_location_idx on devices (location_id);

-- One row per hive-sensor uplink. All measurement columns are nullable because
-- different sensor models report different subsets (scale, probe, or both).
create table if not exists hive_readings (
  device_id        text not null references devices(id) on delete cascade,
  time             timestamptz not null,
  f_cnt            int,

  weight_kg        real,
  hive_temp_c      real,     -- in-hive / brood temperature
  hive_humidity_pct real,    -- in-hive relative humidity
  ambient_temp_c   real,     -- sensor-board or scale temperature
  battery_v        real,

  rssi             int,
  snr              real,
  raw              jsonb,

  primary key (device_id, time)
);

create index if not exists hive_readings_device_time_idx
  on hive_readings (device_id, time desc);

-- Newest non-null value per field for each hive sensor (last 24 h).
create or replace view latest_hive_readings as
select
  r.device_id,
  d.hive_id,
  d.location_id,
  max(r.time) as last_seen,
  (array_agg(r.weight_kg         order by r.time desc) filter (where r.weight_kg         is not null))[1] as weight_kg,
  (array_agg(r.hive_temp_c       order by r.time desc) filter (where r.hive_temp_c       is not null))[1] as hive_temp_c,
  (array_agg(r.hive_humidity_pct order by r.time desc) filter (where r.hive_humidity_pct is not null))[1] as hive_humidity_pct,
  (array_agg(r.ambient_temp_c    order by r.time desc) filter (where r.ambient_temp_c    is not null))[1] as ambient_temp_c,
  (array_agg(r.battery_v         order by r.time desc) filter (where r.battery_v         is not null))[1] as battery_v
from hive_readings r
join devices d on d.id = r.device_id
where r.time > now() - interval '24 hours'
group by r.device_id, d.hive_id, d.location_id;

alter view latest_hive_readings set (security_invoker = true);

-- RLS: public read for the dashboard, writes via service role only.
alter table locations     enable row level security;
alter table hives         enable row level security;
alter table hive_readings enable row level security;

drop policy if exists "anyone can read locations"     on locations;
drop policy if exists "anyone can read hives"         on hives;
drop policy if exists "anyone can read hive readings" on hive_readings;
create policy "anyone can read locations"     on locations     for select using (true);
create policy "anyone can read hives"         on hives         for select using (true);
create policy "anyone can read hive readings" on hive_readings for select using (true);

alter publication supabase_realtime add table hive_readings;
