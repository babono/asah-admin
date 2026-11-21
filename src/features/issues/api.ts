"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSupabase } from "@/components/providers";
import type { Enums } from "@/lib/database.types";
import { friendlyError, unwrap } from "@/lib/errors";

/**
 * Issues (PRD S1-S3) and visit audits (S4). Reads follow RLS (issue.view,
 * checklist.view in scope). State changes go through asah-be's RPCs, which
 * check permission and separation of duties (R7): nobody verifies their own fix.
 */
export const issueKeys = {
  list: (status: Enums<"issue_status">) => ["issues", status] as const,
  events: (id: string) => ["issues", id, "events"] as const,
  audits: ["audits"] as const,
  run: (id: string) => ["runs", id] as const,
};

export function useIssues(status: Enums<"issue_status">) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: issueKeys.list(status),
    queryFn: async () => {
      const q = supabase
        .from("issues")
        .select(
          "id, outlet_id, source, run_id, response_id, title, description, severity, status, raised_by, assigned_to, due_at, fixed_by, fixed_at, closed_at, escalated_at, created_at, checklist_runs(checklist_template_versions(checklist_templates(name)))",
        )
        .eq("status", status);
      return unwrap(
        await (status === "closed" ? q.order("closed_at", { ascending: false }).limit(300) : q.order("due_at").limit(500)),
      );
    },
  });
}
export type IssueRow = NonNullable<ReturnType<typeof useIssues>["data"]>[number];

export const sourceName = (i: IssueRow) =>
  i.checklist_runs?.checklist_template_versions?.checklist_templates?.name ?? null;

export function useIssueEvents(issueId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: issueKeys.events(issueId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("issue_events")
          .select("id, actor_id, type, note, media_file_id, created_at")
          .eq("issue_id", issueId)
          .order("created_at"),
      ),
  });
}

/** Names of colleagues in scope, through asah-be's people_names() (no user.view needed). */
export function usePeople(ids: (string | null | undefined)[]) {
  const supabase = useSupabase();
  const key = [...new Set(ids.filter((x): x is string => Boolean(x)))].sort();
  return useQuery({
    queryKey: ["people", key.join(",")],
    enabled: key.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const rows = unwrap(await supabase.rpc("people_names", { p_ids: key }));
      return new Map(rows.map((r) => [r.id, r.full_name]));
    },
  });
}

/** Active staff at an outlet, to pick an issue owner (needs user.view). */
export function useOutletStaff(outletId: string, enabled: boolean) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["outlet-staff", outletId],
    enabled,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("profiles")
          .select("id, full_name, positions(name)")
          .eq("outlet_id", outletId)
          .eq("status", "active")
          .order("full_name"),
      ),
  });
}

/** Photo on the failed checklist item that raised an issue. */
export function useResponsePhotos(responseId: string | null) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["response-photos", responseId],
    enabled: Boolean(responseId),
    queryFn: async () =>
      unwrap(await supabase.from("checklist_response_photos").select("media_file_id").eq("response_id", responseId!)).map(
        (r) => r.media_file_id,
      ),
  });
}

export function useIssueActions(msgs: { assigned: string; closed: string; reopened: string; commented: string }) {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const done = (issueId: string, message: string) => {
    toast.success(message);
    void qc.invalidateQueries({ queryKey: ["issues"] });
    void qc.invalidateQueries({ queryKey: issueKeys.events(issueId) });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const onError = (e: unknown) => toast.error(friendlyError(e));

  const assign = useMutation({
    mutationFn: async (v: { issueId: string; assigneeId: string }) =>
      unwrap(await supabase.rpc("assign_issue", { p_issue: v.issueId, p_assignee: v.assigneeId })),
    onSuccess: (_r, v) => done(v.issueId, msgs.assigned),
    onError,
  });
  const verify = useMutation({
    mutationFn: async (v: { issueId: string; accept: boolean; note: string | null }) =>
      unwrap(await supabase.rpc("verify_issue", { p_issue: v.issueId, p_accept: v.accept, p_note: v.note ?? undefined })),
    onSuccess: (_r, v) => done(v.issueId, v.accept ? msgs.closed : msgs.reopened),
    onError,
  });
  const comment = useMutation({
    mutationFn: async (v: { issueId: string; actorId: string; note: string }) =>
      unwrap(await supabase.from("issue_events").insert({ issue_id: v.issueId, actor_id: v.actorId, type: "commented", note: v.note })),
    onSuccess: (_r, v) => done(v.issueId, msgs.commented),
    onError,
  });
  return { assign, verify, comment };
}

// ---------------------------------------------------------------- audits

export function useAudits() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: issueKeys.audits,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("checklist_runs")
          .select("id, outlet_id, status, conducted_by, submitted_at, shift_date, compliance_pct, failed_count, item_count, checklist_template_versions(checklist_templates(name))")
          .not("conducted_by", "is", null)
          .order("created_at", { ascending: false })
          .limit(200),
      ),
  });
}
export type AuditRow = NonNullable<ReturnType<typeof useAudits>["data"]>[number];

export function useRunResponses(runId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: issueKeys.run(runId),
    queryFn: async () => {
      const run = unwrap(await supabase.from("checklist_runs").select("template_version_id").eq("id", runId).single());
      const [items, responses] = await Promise.all([
        supabase.from("checklist_items").select("id, sort, label, answer_type, unit").eq("template_version_id", run.template_version_id).order("sort"),
        supabase
          .from("checklist_responses")
          .select("item_id, value_bool, value_number, value_text, passed, checklist_response_photos(media_file_id)")
          .eq("run_id", runId),
      ]);
      const byItem = new Map(unwrap(responses).map((r) => [r.item_id, r]));
      return unwrap(items).map((i) => ({ ...i, response: byItem.get(i.id) ?? null }));
    },
  });
}
