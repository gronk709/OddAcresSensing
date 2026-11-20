import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local.",
  );
}

/**
 * Read-only client, used on both the server and in the browser.
 * The anon key only ever sees what the RLS select policies allow, and there
 * are no write policies, so nothing here can modify data.
 */
export const supabase = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 2 } },
});

export const DEVICE_ID = process.env.NEXT_PUBLIC_DEVICE_ID ?? "snodek104";
export const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? "Australia/Sydney";
