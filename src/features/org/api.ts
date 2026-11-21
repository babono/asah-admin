"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSupabase } from "@/components/providers";
import { friendlyError, unwrap } from "@/lib/errors";

/**
 * Departments, positions and levels (PRD F2). Department = career track,
 * position = job title, level = its step on the ladder. Writes need
 * org.manage; archiving a position still in use is refused by a trigger.
 */
export const orgKeys = {
  departments: ["departments"] as const,
  positions: ["positions"] as const,
};

/** Active positions, for pickers across the admin. */
export function usePositions() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: orgKeys.positions,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("positions")
          .select("id, name, level, department_id, departments(name)")
          .is("archived_at", null)
          .order("name"),
      ),
  });
}
export type PositionOption = NonNullable<ReturnType<typeof usePositions>["data"]>[number];

export function useDepartments() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: orgKeys.departments,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("departments")
          .select("id, name, sort_order, archived_at, positions(id, name, level, archived_at)")
          .order("sort_order")
          .order("name"),
      ),
  });
}
export type Department = NonNullable<ReturnType<typeof useDepartments>["data"]>[number];
export type Position = Department["positions"][number];

function useOrgMutation<V>(fn: (v: V) => Promise<unknown>, success?: string | ((v: V) => string)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, v) => {
      if (success) toast.success(typeof success === "function" ? success(v) : success);
      void qc.invalidateQueries({ queryKey: orgKeys.departments });
      void qc.invalidateQueries({ queryKey: orgKeys.positions });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
}

export function useOrgActions(msgs: { saved: string; archived: string; restored: string }) {
  const supabase = useSupabase();
  const now = () => new Date().toISOString();

  const saveDepartment = useOrgMutation(async (v: { id?: string; name: string; sort_order?: number }) =>
    v.id
      ? unwrap(await supabase.from("departments").update({ name: v.name }).eq("id", v.id))
      : unwrap(await supabase.from("departments").insert({ name: v.name, sort_order: v.sort_order ?? 0 })),
  msgs.saved);

  const archiveDepartment = useOrgMutation(
    async (d: { id: string; archived: boolean }) =>
      unwrap(await supabase.from("departments").update({ archived_at: d.archived ? null : now() }).eq("id", d.id)),
    (d) => (d.archived ? msgs.restored : msgs.archived),
  );

  /** Rewrites sort_order for the whole list in its new order. */
  const reorderDepartments = useOrgMutation(async (ids: string[]) => {
    for (const [i, id] of ids.entries()) {
      unwrap(await supabase.from("departments").update({ sort_order: i }).eq("id", id));
    }
  });

  const savePosition = useOrgMutation(async (v: { id?: string; department_id: string; name: string; level: number }) =>
    v.id
      ? unwrap(await supabase.from("positions").update({ name: v.name, level: v.level }).eq("id", v.id))
      : unwrap(await supabase.from("positions").insert({ department_id: v.department_id, name: v.name, level: v.level })),
  msgs.saved);

  const archivePosition = useOrgMutation(
    async (p: { id: string; archived: boolean }) =>
      unwrap(await supabase.from("positions").update({ archived_at: p.archived ? null : now() }).eq("id", p.id)),
    (p) => (p.archived ? msgs.restored : msgs.archived),
  );

  return { saveDepartment, archiveDepartment, reorderDepartments, savePosition, archivePosition };
}
