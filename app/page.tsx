import Dashboard from "@/components/Dashboard";
import { supabase, DEVICE_ID } from "@/lib/supabase";
import LocationSwitcher from "@/components/LocationSwitcher";
import {
  READING_COLUMNS, type Device, type LocationOption, type Reading,
} from "@/lib/types";

// Readings arrive every few minutes, so never serve a cached page.
export const dynamic = "force-dynamic";

const HISTORY_HOURS = 48;

const slugify = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Locations that have a weather station, one station each (the first by id). */
async function loadLocations(): Promise<LocationOption[]> {
  const [locs, devs] = await Promise.all([
    supabase.from("locations").select("id,name").order("name"),
    supabase.from("devices").select("id,location_id").eq("kind", "weather").order("id"),
  ]);
  const options: LocationOption[] = [];
  for (const loc of locs.data ?? []) {
    const dev = (devs.data ?? []).find((d) => d.location_id === loc.id);
    if (dev) options.push({ id: loc.id, name: loc.name, slug: slugify(loc.name), deviceId: dev.id });
  }
  return options;
}

export default async function Page({
  searchParams,
}: {
  searchParams: { location?: string };
}) {
  const since = new Date(Date.now() - HISTORY_HOURS * 3600_000).toISOString();

  const locations = await loadLocations();
  const chosen =
    locations.find((l) => l.slug === searchParams.location) ?? locations[0] ?? null;
  // With no locations configured yet, fall back to the single configured device.
  const deviceId = chosen?.deviceId ?? DEVICE_ID;

  const [readings, device] = await Promise.all([
    supabase
      .from("readings")
      .select(READING_COLUMNS)
      .eq("device_id", deviceId)
      .gte("time", since)
      .order("time", { ascending: true })
      .limit(5000),
    supabase
      .from("devices")
      .select("id,name,latitude,longitude,elevation_m")
      .eq("id", deviceId)
      .maybeSingle(),
  ]);

  if (readings.error) {
    return (
      <main className="page">
        <div className="empty">
          <h1>Readings could not be loaded</h1>
          <p>{readings.error.message}</p>
          <p>
            Check that the migration has been applied and that the read policy on{" "}
            <code>readings</code> allows the anon key.
          </p>
        </div>
      </main>
    );
  }

  return (
    <Dashboard
      key={deviceId}
      initialRows={(readings.data ?? []) as unknown as Reading[]}
      device={(device.data ?? null) as Device | null}
      deviceId={deviceId}
      locationName={chosen?.name ?? null}
      historyHours={HISTORY_HOURS}
      switcher={
        chosen ? <LocationSwitcher locations={locations} selected={chosen.id} /> : null
      }
    />
  );
}
