import type { PostgrestError } from "@supabase/supabase-js";

/** A message for people. Server rules raise readable messages, so those pass through. */
export function friendlyError(e: unknown): string {
  const pg = e as Partial<PostgrestError>;
  if (pg && typeof pg === "object" && "code" in pg && pg.message) {
    if (pg.code === "42501") return pg.message === "not allowed" ? "You are not allowed to do this." : capitalize(pg.message);
    if (pg.code === "23505") return "That already exists.";
    return capitalize(pg.message);
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Throws the Supabase error, if any, so React Query and toasts see it. */
export function unwrap<T>(res: { data: T; error: PostgrestError | null }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
