# Weather station dashboard

Live readings from a METER ATMOS 41 on The Things Network, stored in Supabase
and shown on a Next.js dashboard deployed to Vercel.

The station splits one reading cycle across two uplinks a few seconds apart:
`sdi_0` carries the weather, `sdi_1` carries barometric pressure and mast tilt.
Both land as separate rows, so most rows are half empty. Everything downstream
is built around that.

## 1. Database

Run the migration in the Supabase SQL editor, or with the CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

`0001_init.sql` creates `devices` and `readings`, a `latest_readings` view, RLS
policies, and adds `readings` to the realtime publication. It also seeds a
device row. **Change the seeded elevation** to your mast's actual elevation,
since sea-level pressure depends on it:

```sql
update devices set elevation_m = <metres>, name = '<name>' where id = 'snodek104';
```

`0002_rollups.sql` is optional. Apply it once you have a few weeks of history
and want fast month or year views.

The migration makes readings publicly readable. If the dashboard should be
private, drop the two select policies and add auth.

## 2. Ingest function

```bash
supabase secrets set TTN_WEBHOOK_SECRET="$(openssl rand -hex 32)"
supabase functions deploy ttn-ingest --no-verify-jwt
```

`--no-verify-jwt` is required because TTN cannot send a Supabase JWT. The
function authenticates with its own `x-webhook-secret` header instead, so keep
that secret long and private.

## 3. TTN webhook

In the TTN console, open your application, then Integrations → Webhooks → Add
webhook → Custom webhook:

- **Base URL:** `https://<project-ref>.supabase.co/functions/v1/ttn-ingest`
- **Format:** JSON
- **Additional headers:** `x-webhook-secret` = the secret you just set
- **Enabled event types:** Uplink message only

Leave the other event types off. The function ignores anything without a
decoded `DATA_PACKET` payload, but there is no reason to send them.

Confirm it works:

```bash
supabase functions logs ttn-ingest
select time, temperature_c, pressure_kpa from readings order by time desc limit 10;
```

You should see alternating rows, one with weather fields and one with pressure.

## 4. Dashboard

```bash
cp .env.example .env.local   # fill in the project URL, anon key and device id
npm install
npm run dev
```

Deploy by pushing to a Git repo and importing it in Vercel. Set the same four
environment variables there. No server secrets are involved: the dashboard only
ever uses the anon key, and there are no write policies for it to use.

## How it fits together

- `app/page.tsx` loads 48 hours of readings on the server.
- `components/Dashboard.tsx` subscribes to Supabase Realtime and **merges**
  each new row into the current conditions, keeping the newest non-null value
  per field. Replacing instead of merging would blank the temperature every
  time a pressure uplink arrived.
- Charts are hand-drawn SVG rather than a charting library, so there is no
  dependency to keep up with and the wind rose and line charts share one visual
  language.
- Derived values (dew point, vapour pressure deficit, apparent temperature,
  sea-level pressure) are computed in `lib/format.ts` from stored fields rather
  than stored themselves.

## Things to check against your station

- **`fault`** is non-zero in sample uplinks while the battery charges normally.
  Look up what the bit means in the METER documentation before you build an
  alert on it. The dashboard shows it without interpreting it.
- **`precipitation`** is treated as accumulation for the interval and summed.
  If your logger is configured to report a running total instead, convert it to
  a delta in the Edge Function before inserting.
- **`command`** is stored as `sdi_cmd`. It differs between the two uplinks and
  looks like a packet index, but nothing depends on it.
- **Strike distance** is forced to null when strikes are zero, since the sensor
  reports 0 km rather than "none".
