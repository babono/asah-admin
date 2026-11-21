"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSupabase } from "@/components/providers";
import { friendlyError, unwrap } from "@/lib/errors";

/**
 * One active learning path per position (PRD T6). Adding a module assigns it
 * to everyone in the position once it is published; new hires and transfers
 * get the path automatically (T7, triggers in asah-be). Needs path.manage.
 */
export const pathKeys = { byPosition: (positionId: string) => ["paths", positionId] as const };

export function usePath(positionId: string | null) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: pathKeys.byPosition(positionId ?? ""),
    enabled: Boolean(positionId),
    queryFn: async () => {
      const path = unwrap(
        await supabase
          .from("learning_paths")
          .select("id, name, learning_path_items(id, module_id, sort, is_mandatory, due_days)")
          .eq("position_id", positionId!)
          .is("archived_at", null)
          .maybeSingle(),
      );
      if (!path) return null;
      return { ...path, items: [...path.learning_path_items].sort((a, b) => a.sort - b.sort) };
    },
  });
}
export type Path = NonNullable<NonNullable<ReturnType<typeof usePath>["data"]>>;
export type PathItem = Path["items"][number];

export function usePathActions(positionId: string, msgs: { saved: string; added: string; removed: string }) {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const options = <V,>(fn: (v: V) => Promise<unknown>, success?: string) => ({
    mutationFn: fn,
    onSuccess: () => {
      if (success) toast.success(success);
      void qc.invalidateQueries({ queryKey: pathKeys.byPosition(positionId) });
    },
    onError: (e: unknown) => toast.error(friendlyError(e)),
  });

  const createPath = useMutation(
    options(async (name: string) => unwrap(await supabase.from("learning_paths").insert({ position_id: positionId, name }))),
  );
  const renamePath = useMutation(
    options(async (v: { id: string; name: string }) => unwrap(await supabase.from("learning_paths").update({ name: v.name }).eq("id", v.id)), msgs.saved),
  );
  const addItem = useMutation(
    options(
      async (v: { pathId: string; moduleId: string; dueDays: number; mandatory: boolean; sort: number }) =>
        unwrap(
          await supabase.from("learning_path_items").insert({
            path_id: v.pathId,
            module_id: v.moduleId,
            due_days: v.dueDays,
            is_mandatory: v.mandatory,
            sort: v.sort,
          }),
        ),
      msgs.added,
    ),
  );
  const updateItem = useMutation(
    options(async (v: { id: string; due_days?: number; is_mandatory?: boolean }) => {
      const { id, ...patch } = v;
      return unwrap(await supabase.from("learning_path_items").update(patch).eq("id", id));
    }),
  );
  const moveItem = useMutation(
    options(async (v: { a: PathItem; b: PathItem }) => {
      unwrap(await supabase.from("learning_path_items").update({ sort: v.b.sort }).eq("id", v.a.id));
      unwrap(await supabase.from("learning_path_items").update({ sort: v.a.sort }).eq("id", v.b.id));
    }),
  );
  const removeItem = useMutation(
    options(async (id: string) => unwrap(await supabase.from("learning_path_items").delete().eq("id", id)), msgs.removed),
  );

  return { createPath, renamePath, addItem, updateItem, moveItem, removeItem };
}
