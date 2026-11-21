"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSupabase } from "@/components/providers";
import type { Enums, Tables, TablesInsert } from "@/lib/database.types";
import { friendlyError, unwrap } from "@/lib/errors";
import { useRequiredSession } from "@/lib/session";

/**
 * Checklist templates (PRD A1, A2, A4). Writes go straight to the tables:
 * RLS in asah-be allows them only with checklist_template.manage, and keeps
 * items of a published version frozen.
 */

export const keys = {
  all: ["checklists"] as const,
  one: (id: string) => ["checklists", id] as const,
  positions: ["positions"] as const,
};

export type Item = Tables<"checklist_items">;
export type Schedule = Tables<"checklist_schedules">;

export function useTemplates() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: keys.all,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("checklist_templates")
          .select(
            "id, name, kind, brand_id, archived_at, brands(name), checklist_template_versions(id, version, published_at), checklist_template_positions(positions(name)), checklist_schedules(id, shift, due_time, active)",
          )
          .order("kind")
          .order("name"),
      ),
  });
}
export type TemplateRow = NonNullable<ReturnType<typeof useTemplates>["data"]>[number];

export function useTemplate(id: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: keys.one(id),
    queryFn: async () => {
      const template = unwrap(await supabase.from("checklist_templates").select("*").eq("id", id).single());
      const versions = unwrap(
        await supabase.from("checklist_template_versions").select("*").eq("template_id", id).order("version", { ascending: false }),
      );
      const latest = versions[0];
      const [items, positions, schedules] = await Promise.all([
        supabase.from("checklist_items").select("*").eq("template_version_id", latest.id).order("sort"),
        supabase.from("checklist_template_positions").select("position_id").eq("template_id", id),
        supabase.from("checklist_schedules").select("*").eq("template_id", id).order("due_time"),
      ]);
      return {
        template,
        versions,
        latest,
        isDraft: latest.published_at == null,
        isAudit: template.kind === "audit",
        items: unwrap(items),
        positionIds: new Set(unwrap(positions).map((p) => p.position_id)),
        schedules: unwrap(schedules),
      };
    },
  });
}
export type TemplateDetail = NonNullable<ReturnType<typeof useTemplate>["data"]>;

export function usePositions() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: keys.positions,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("positions")
          .select("id, name, level, departments(name)")
          .is("archived_at", null)
          .order("name"),
      ),
  });
}

/** Mutation that refreshes the template and the list, and toasts the outcome. */
function useTemplateMutation<V, R = unknown>(templateId: string | null, fn: (v: V) => Promise<R>, success?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (success) toast.success(success);
      void qc.invalidateQueries({ queryKey: keys.all });
      if (templateId) void qc.invalidateQueries({ queryKey: keys.one(templateId) });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
}

export function useCreateTemplate() {
  const supabase = useSupabase();
  const me = useRequiredSession().profile.id;
  return useTemplateMutation(null, async (v: { name: string; kind: Enums<"checklist_kind"> }) => {
    const t = unwrap(
      await supabase.from("checklist_templates").insert({ name: v.name, kind: v.kind, created_by: me }).select("id").single(),
    );
    unwrap(await supabase.from("checklist_template_versions").insert({ template_id: t.id, version: 1, created_by: me }));
    return t.id;
  });
}

export function useTemplateActions(d: TemplateDetail, messages: { saved: string; published: string; newVersion: string; archived: string; restored: string }) {
  const supabase = useSupabase();
  const me = useRequiredSession().profile.id;
  const id = d.template.id;

  const saveSettings = useTemplateMutation(
    id,
    async (v: { name: string; brand_id: string | null; fail_issue_severity: Enums<"issue_severity">; fail_issue_sla_hours: number }) =>
      unwrap(await supabase.from("checklist_templates").update(v).eq("id", id)),
    messages.saved,
  );

  const togglePosition = useTemplateMutation(id, async (v: { positionId: string; on: boolean }) =>
    v.on
      ? unwrap(await supabase.from("checklist_template_positions").insert({ template_id: id, position_id: v.positionId }))
      : unwrap(await supabase.from("checklist_template_positions").delete().eq("template_id", id).eq("position_id", v.positionId)),
  );

  const publish = useTemplateMutation(
    id,
    async () =>
      unwrap(
        await supabase
          .from("checklist_template_versions")
          .update({ published_at: new Date().toISOString() })
          .eq("id", d.latest.id),
      ),
    messages.published,
  );

  /** Published items are frozen; copy them into a new draft version. */
  const newVersion = useTemplateMutation(
    id,
    async () => {
      const v = unwrap(
        await supabase
          .from("checklist_template_versions")
          .insert({ template_id: id, version: d.latest.version + 1, created_by: me })
          .select("id")
          .single(),
      );
      if (d.items.length > 0) {
        unwrap(
          await supabase.from("checklist_items").insert(
            d.items.map(({ id: _id, template_version_id: _v, ...rest }) => ({ ...rest, template_version_id: v.id })),
          ),
        );
      }
    },
    messages.newVersion,
  );

  const archive = useTemplateMutation(
    id,
    async () =>
      unwrap(
        await supabase
          .from("checklist_templates")
          .update({ archived_at: d.template.archived_at ? null : new Date().toISOString() })
          .eq("id", id),
      ),
    d.template.archived_at ? messages.restored : messages.archived,
  );

  const saveItem = useTemplateMutation(id, async (v: { id?: string; values: Omit<TablesInsert<"checklist_items">, "template_version_id" | "sort"> }) => {
    if (v.id) return unwrap(await supabase.from("checklist_items").update(v.values).eq("id", v.id));
    const next = Math.max(0, ...d.items.map((i) => i.sort)) + 1;
    return unwrap(await supabase.from("checklist_items").insert({ ...v.values, template_version_id: d.latest.id, sort: next }));
  });

  const deleteItem = useTemplateMutation(id, async (itemId: string) =>
    unwrap(await supabase.from("checklist_items").delete().eq("id", itemId)),
  );

  /** (version, sort) is unique, so park one item while swapping. */
  const moveItem = useTemplateMutation(id, async (v: { index: number; delta: -1 | 1 }) => {
    const a = d.items[v.index];
    const b = d.items[v.index + v.delta];
    if (!a || !b) return;
    unwrap(await supabase.from("checklist_items").update({ sort: -1 }).eq("id", a.id));
    unwrap(await supabase.from("checklist_items").update({ sort: a.sort }).eq("id", b.id));
    unwrap(await supabase.from("checklist_items").update({ sort: b.sort }).eq("id", a.id));
  });

  const saveSchedule = useTemplateMutation(
    id,
    async (v: { id?: string; values: Omit<TablesInsert<"checklist_schedules">, "template_id"> }) =>
      v.id
        ? unwrap(await supabase.from("checklist_schedules").update(v.values).eq("id", v.id))
        : unwrap(await supabase.from("checklist_schedules").insert({ ...v.values, template_id: id })),
  );

  const deleteSchedule = useTemplateMutation(id, async (scheduleId: string) =>
    unwrap(await supabase.from("checklist_schedules").delete().eq("id", scheduleId)),
  );

  const toggleSchedule = useTemplateMutation(id, async (v: { id: string; active: boolean }) =>
    unwrap(await supabase.from("checklist_schedules").update({ active: v.active }).eq("id", v.id)),
  );

  return { saveSettings, togglePosition, publish, newVersion, archive, saveItem, deleteItem, moveItem, saveSchedule, deleteSchedule, toggleSchedule };
}
