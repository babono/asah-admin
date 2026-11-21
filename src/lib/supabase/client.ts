import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Browser client, acting as the signed-in user. Every query goes through RLS
 * and the RPCs in asah-be check permissions again, so the admin never needs
 * the service role key.
 */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY);
}

export type Supabase = ReturnType<typeof createClient>;
