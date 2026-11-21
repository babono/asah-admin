"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSupabase } from "@/components/providers";
import type { TablesInsert } from "@/lib/database.types";
import { friendlyError, unwrap } from "@/lib/errors";

/** Brands, areas and outlets (PRD F3). Writes need outlet.manage. */
export const outletKeys = {
  brands: ["brands"] as const,
  areas: ["areas"] as const,
  outlets: ["outlets-admin"] as const,
};

export type Named = { id: string; name: string; archived_at: string | null };
export type NamedTable = "brands" | "areas";

export function useNamed(table: NamedTable) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: outletKeys[table],
    queryFn: async (): Promise<Named[]> =>
      table === "brands"
        ? unwrap(await supabase.from("brands").select("id, name, archived_at").order("name"))
        : unwrap(await supabase.from("areas").select("id, name, archived_at").order("name")),
  });
}

export function useOutletsAdmin() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: outletKeys.outlets,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("outlets")
          .select("id, name, brand_id, area_id, address, latitude, longitude, geofence_radius_m, timezone, archived_at, brands(name), areas(name)")
          .order("name"),
      ),
  });
}
export type OutletRow = NonNullable<ReturnType<typeof useOutletsAdmin>["data"]>[number];
export type OutletValues = Omit<TablesInsert<"outlets">, "id" | "created_at" | "updated_at" | "archived_at">;

function useOutletMutation<V>(fn: (v: V) => Promise<unknown>, success?: (v: V) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, v) => {
      if (success) toast.success(success(v));
      for (const key of Object.values(outletKeys)) void qc.invalidateQueries({ queryKey: key });
      // Outlet names and brands also live in the cached session (sidebar scope, pickers).
      void qc.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
}

export function useOutletActions(msgs: { saved: string; archived: string; restored: string }) {
  const supabase = useSupabase();
  const now = () => new Date().toISOString();

  const saveNamed = useOutletMutation(
    async (v: { table: NamedTable; id?: string; name: string }) => {
      if (v.table === "brands") {
        return v.id
          ? unwrap(await supabase.from("brands").update({ name: v.name }).eq("id", v.id))
          : unwrap(await supabase.from("brands").insert({ name: v.name }));
      }
      return v.id
        ? unwrap(await supabase.from("areas").update({ name: v.name }).eq("id", v.id))
        : unwrap(await supabase.from("areas").insert({ name: v.name }));
    },
    () => msgs.saved,
  );

  const archiveNamed = useOutletMutation(
    async (v: { table: NamedTable; id: string; archived: boolean }) => {
      const archived_at = v.archived ? null : now();
      return v.table === "brands"
        ? unwrap(await supabase.from("brands").update({ archived_at }).eq("id", v.id))
        : unwrap(await supabase.from("areas").update({ archived_at }).eq("id", v.id));
    },
    (v) => (v.archived ? msgs.restored : msgs.archived),
  );

  const saveOutlet = useOutletMutation(
    async (v: { id?: string; values: OutletValues }) =>
      v.id
        ? unwrap(await supabase.from("outlets").update(v.values).eq("id", v.id))
        : unwrap(await supabase.from("outlets").insert(v.values)),
    () => msgs.saved,
  );

  const archiveOutlet = useOutletMutation(
    async (v: { id: string; archived: boolean }) =>
      unwrap(await supabase.from("outlets").update({ archived_at: v.archived ? null : now() }).eq("id", v.id)),
    (v) => (v.archived ? msgs.restored : msgs.archived),
  );

  return { saveNamed, archiveNamed, saveOutlet, archiveOutlet };
}
