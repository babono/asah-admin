"use client";

import { useQuery } from "@tanstack/react-query";

import { useSupabase } from "@/components/providers";
import { unwrap } from "@/lib/errors";

/**
 * Outlet, area and group dashboards (PRD S4, S5). All reads go through RLS,
 * so the numbers only ever cover outlets in the viewer's scope.
 */
export type OutletKpis = {
  outletId: string;
  runs: number;
  onTime: number;
  missed: number;
  openIssues: number;
  lateIssues: number;
  escalated: number;
  assigned: number;
  modulesOverdue: number;
  traineesBehind: number;
  lastAudit: string | null;
};

export type WeekPoint = { week: string; runs: number; onTime: number };

const pct = (part: number, whole: number) => (whole === 0 ? null : (part * 100) / whole);
export const onTimePct = (k: { runs: number; onTime: number }) => pct(k.onTime, k.runs);
export const trainingPct = (k: { assigned: number; modulesOverdue: number }) => pct(k.assigned - k.modulesOverdue, k.assigned);

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
/** Monday of the week containing an ISO date. */
function weekStart(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return isoDate(d);
}

export function useDashboard(outletIds: string[], days: number) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["dashboard", outletIds.join(","), days],
    enabled: outletIds.length > 0,
    placeholderData: (prev) => prev, // keep the last render while a new period loads
    queryFn: async () => {
      const now = Date.now();
      const since = isoDate(new Date(now - (days - 1) * 86_400_000));
      const trendSince = isoDate(new Date(now - 8 * 7 * 86_400_000));
      const [compliance, issues, training, audits, resolution] = await Promise.all([
        supabase
          .from("v_outlet_daily_compliance")
          .select("outlet_id, shift_date, runs, on_time, missed")
          .in("outlet_id", outletIds)
          .gte("shift_date", trendSince),
        supabase
          .from("issues")
          .select("id, title, outlet_id, status, due_at, escalated_at, assigned_to")
          .in("outlet_id", outletIds)
          .neq("status", "closed"),
        supabase.from("v_training_progress").select("outlet_id, assigned, overdue").in("outlet_id", outletIds),
        supabase
          .from("checklist_runs")
          .select("outlet_id, submitted_at")
          .in("outlet_id", outletIds)
          .not("conducted_by", "is", null)
          .eq("status", "submitted")
          .order("submitted_at", { ascending: false })
          .limit(500),
        supabase
          .from("v_issue_resolution")
          .select("hours_open")
          .in("outlet_id", outletIds)
          .eq("status", "closed")
          .gte("created_at", new Date(now - Math.max(days, 7) * 86_400_000).toISOString())
          .limit(2000),
      ]);

      const kpis = new Map<string, OutletKpis>(
        outletIds.map((id) => [
          id,
          { outletId: id, runs: 0, onTime: 0, missed: 0, openIssues: 0, lateIssues: 0, escalated: 0, assigned: 0, modulesOverdue: 0, traineesBehind: 0, lastAudit: null },
        ]),
      );

      const weekly = new Map<string, WeekPoint>();
      for (const r of unwrap(compliance)) {
        if (!r.outlet_id || !r.shift_date) continue;
        const runs = r.runs ?? 0;
        const onTime = r.on_time ?? 0;
        const w = weekStart(r.shift_date);
        const p = weekly.get(w) ?? { week: w, runs: 0, onTime: 0 };
        weekly.set(w, { week: w, runs: p.runs + runs, onTime: p.onTime + onTime });
        if (r.shift_date < since) continue;
        const k = kpis.get(r.outlet_id);
        if (!k) continue;
        k.runs += runs;
        k.onTime += onTime;
        k.missed += r.missed ?? 0;
      }

      const openIssues = unwrap(issues);
      const nowIso = new Date(now).toISOString();
      for (const i of openIssues) {
        const k = kpis.get(i.outlet_id);
        if (!k) continue;
        k.openIssues++;
        if (i.status === "open" && i.due_at < nowIso) k.lateIssues++;
        if (i.status === "open" && i.escalated_at) k.escalated++;
      }

      for (const tr of unwrap(training)) {
        const k = tr.outlet_id ? kpis.get(tr.outlet_id) : undefined;
        if (!k) continue;
        const overdue = tr.overdue ?? 0;
        k.assigned += tr.assigned ?? 0;
        k.modulesOverdue += overdue;
        if (overdue > 0) k.traineesBehind++;
      }

      for (const a of unwrap(audits)) {
        const k = kpis.get(a.outlet_id);
        if (k && !k.lastAudit) k.lastAudit = a.submitted_at;
      }

      const hours = unwrap(resolution)
        .map((r) => r.hours_open)
        .filter((h): h is number => h != null)
        .sort((a, b) => a - b);

      const outlets = [...kpis.values()];
      const sum = (f: (k: OutletKpis) => number) => outlets.reduce((s, k) => s + f(k), 0);
      return {
        outlets,
        totals: {
          runs: sum((k) => k.runs),
          onTime: sum((k) => k.onTime),
          openIssues: sum((k) => k.openIssues),
          assigned: sum((k) => k.assigned),
          modulesOverdue: sum((k) => k.modulesOverdue),
        },
        escalated: openIssues
          .filter((i) => i.status === "open" && i.escalated_at)
          .sort((a, b) => a.due_at.localeCompare(b.due_at)),
        weekly: [...weekly.values()].sort((a, b) => a.week.localeCompare(b.week)),
        medianFixHours: hours.length ? hours[Math.floor(hours.length / 2)] : null,
      };
    },
  });
}
export type DashboardData = NonNullable<ReturnType<typeof useDashboard>["data"]>;
