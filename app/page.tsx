import Dashboard from "@/components/Dashboard";
import { supabase, DEVICE_ID } from "@/lib/supabase";
import { READING_COLUMNS, type Device, type Reading } from "@/lib/types";

// Readings arrive every few minutes, so never serve a cached page.
export const dynamic = "force-dynamic";

const HISTORY_HOURS = 48;

export default async function Page() {
  const since = new Date(Date.now() - HISTORY_HOURS * 3600_000).toISOString();

  const [readings, device] = await Promise.all([
    supabase
      .from("readings")
      .select(READING_COLUMNS)
      .eq("device_id", DEVICE_ID)
      .gte("time", since)
      .order("time", { ascending: true })
      .limit(5000),
    supabase
      .from("devices")
      .select("id,name,latitude,longitude,elevation_m")
      .eq("id", DEVICE_ID)
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
      initialRows={(readings.data ?? []) as unknown as Reading[]}
      device={(device.data ?? null) as Device | null}
      historyHours={HISTORY_HOURS}
    />
  );
}
