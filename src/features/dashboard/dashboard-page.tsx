"use client";

import { Download, Loader2 } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { DataTable, type AdminColumn } from "@/components/admin/data-table";
import { NULL_OPTION } from "@/components/admin/form-fields";
import { EmptyState, PageHeader, Pill, Section } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCsv } from "@/lib/download";
import { friendlyError } from "@/lib/errors";
import { useRequiredSession, type Outlet } from "@/lib/session";
import { cn } from "@/lib/utils";

import { onTimePct, trainingPct, useDashboard, type OutletKpis } from "./api";
import { TrendChart } from "./trend-chart";

/** PRD goal: scheduled checklists completed on time, 90% or more. */
const TARGET = 90;

/** Outlet, area and group dashboards (PRD S4) with trend and CSV export (S5). */
export function DashboardPage() {
  const t = useTranslations("dashboard");
  const session = useRequiredSession();
  const inScope = session.outletsWith("dashboard.view");
  const areas = useMemo(() => new Map(inScope.map((o) => [o.areaId, o.areaName ?? ""])), [inScope]);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const outlets = areaId ? inScope.filter((o) => o.areaId === areaId) : inScope;
  const data = useDashboard(
    outlets.map((o) => o.id),
    days,
  );

  const scopeName = areaId ? areas.get(areaId) : areas.size > 1 ? t("group") : ([...areas.values()][0] ?? "");
  const canExport = session.hasAny("data.export");

  function exportCsv() {
    if (!data.data) return;
    const byId = new Map(data.data.outlets.map((k) => [k.outletId, k]));
    downloadCsv(`asah-dashboard-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Outlet", "Area", "Checklist runs", "On time", "On time %", "Missed", "Open issues", "Late issues", "Escalated", "Modules assigned", "Modules overdue", "Trainees behind", "Last audit"],
      ...outlets.map((o) => {
        const k = byId.get(o.id)!;
        const p = onTimePct(k);
        return [o.name, o.areaName, k.runs, k.onTime, p == null ? null : Number(p.toFixed(1)), k.missed, k.openIssues, k.lateIssues, k.escalated, k.assigned, k.modulesOverdue, k.traineesBehind, k.lastAudit?.slice(0, 10) ?? null];
      }),
    ]);
  }

  return (
    <>
      <PageHeader
        breadcrumb={`${t("scope", { scope: scopeName ?? "", count: outlets.length })} · ${days === 7 ? t("last7") : t("last28")}`}
        title={areaId || areas.size <= 1 ? t("areaTitle") : t("groupTitle")}
        actions={
          <>
            {areas.size > 1 && (
              <Select value={areaId ?? NULL_OPTION} onValueChange={(v) => setAreaId(v === NULL_OPTION ? null : v)}>
                <SelectTrigger className="h-11 w-48 bg-white" aria-label={t("area")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NULL_OPTION}>{t("allAreas")}</SelectItem>
                  {[...areas.entries()].map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="h-11 w-44 bg-white" aria-label={t("period")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t("last7")}</SelectItem>
                <SelectItem value="28">{t("last28")}</SelectItem>
              </SelectContent>
            </Select>
            {canExport && (
              <Button variant="outline" className="h-11 px-4" disabled={!data.data} onClick={exportCsv}>
                <Download /> {t("export")}
              </Button>
            )}
          </>
        }
      />

      {outlets.length === 0 ? (
        <EmptyState>{t("noOutlets")}</EmptyState>
      ) : data.isPending ? (
        <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />
      ) : data.isError ? (
        <EmptyState>{friendlyError(data.error)}</EmptyState>
      ) : (
        <div className={cn("transition-opacity", data.isFetching && "opacity-60")}>
          <Tiles data={data.data} />
          <Section title={t("byOutlet")}>
            <OutletTable outlets={outlets} kpis={data.data.outlets} />
          </Section>
          <Section title={t("trend")}>
            <TrendChart weekly={data.data.weekly} target={TARGET} />
          </Section>
          <Escalated data={data.data} />
        </div>
      )}
    </>
  );
}

function useDuration() {
  const t = useTranslations("dashboard");
  return {
    fix: (hours: number) => (hours < 1 ? t("minutes", { m: Math.round(hours * 60) }) : t("hours", { h: Math.floor(hours), m: Math.round((hours % 1) * 60) })),
    late: (dueIso: string) => {
      const h = Math.max(0, Math.floor((Date.now() - new Date(dueIso).getTime()) / 3_600_000));
      return h >= 24 ? t("dayShort", { d: Math.floor(h / 24) }) : t("hourShort", { h });
    },
  };
}

function Tiles({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  const t = useTranslations("dashboard");
  const dur = useDuration();
  const pct = onTimePct(data.totals);
  const train = trainingPct(data.totals);
  const fmt = (v: number | null) => (v == null ? "–" : `${Math.round(v)}%`);
  const tiles = [
    { label: t("onTime"), value: fmt(pct), note: t("target", { pct: TARGET }), warn: pct != null && pct < TARGET },
    { label: t("openIssues"), value: String(data.totals.openIssues), note: data.medianFixHours == null ? t("noFixes") : t("medianFix", { time: dur.fix(data.medianFixHours) }) },
    { label: t("escalatedTile"), value: String(data.escalated.length), note: t("pastDeadline"), alert: data.escalated.length > 0 },
    { label: t("trainingOnSchedule"), value: fmt(train), note: t("modulesOverdue", { count: data.totals.modulesOverdue }) },
  ];
  return (
    <div className="mb-5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={cn("rounded-2xl border p-[18px]", tile.alert ? "bg-danger-soft border-danger-border" : "bg-card")}
        >
          <p className={cn("text-[13px] font-semibold", tile.alert ? "text-[#8f1c13]" : "text-muted-foreground")}>{tile.label}</p>
          <p className={cn("mt-1.5 text-[32px] leading-none font-extrabold", tile.alert && "text-destructive")}>{tile.value}</p>
          <p
            className={cn(
              "mt-1.5 text-xs",
              tile.alert ? "font-semibold text-[#8f1c13]" : tile.warn ? "text-warning font-semibold" : "text-muted-foreground",
            )}
          >
            {tile.note}
          </p>
        </div>
      ))}
    </div>
  );
}

type Row = Outlet & { k: OutletKpis };

function OutletTable({ outlets, kpis }: { outlets: Outlet[]; kpis: OutletKpis[] }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const rows = useMemo(() => {
    const byId = new Map(kpis.map((k) => [k.outletId, k]));
    return outlets.map((o) => ({ ...o, k: byId.get(o.id)! }));
  }, [outlets, kpis]);

  const columns = useMemo<AdminColumn<Row>[]>(
    () => [
      { id: "outlet", header: t("colOutlet"), accessorFn: (r) => r.name, cell: ({ row }) => <span className="font-bold">{row.original.name}</span> },
      {
        id: "onTime",
        header: t("colOnTime"),
        accessorFn: (r) => onTimePct(r.k) ?? -1,
        cell: ({ row }) => {
          const p = onTimePct(row.original.k);
          const below = p != null && p < TARGET;
          return (
            <div className="flex w-56 items-center gap-2.5">
              <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                <div className={cn("h-full rounded-full", below ? "bg-below-target" : "bg-primary")} style={{ width: `${p ?? 0}%` }} />
              </div>
              <span className="w-11 font-bold tabular-nums">{p == null ? "–" : `${Math.round(p)}%`}</span>
            </div>
          );
        },
      },
      { id: "open", header: t("colOpen"), accessorFn: (r) => r.k.openIssues },
      {
        id: "late",
        header: t("colLate"),
        accessorFn: (r) => r.k.lateIssues,
        cell: ({ row }) => (
          <span className={cn(row.original.k.lateIssues > 0 && "text-destructive font-bold")}>{row.original.k.lateIssues}</span>
        ),
      },
      {
        id: "training",
        header: t("colTraining"),
        accessorFn: (r) => r.k.traineesBehind,
        cell: ({ row }) => (row.original.k.traineesBehind === 0 ? t("onSchedule") : t("behind", { count: row.original.k.traineesBehind })),
      },
      {
        id: "audit",
        header: t("colLastAudit"),
        accessorFn: (r) => r.k.lastAudit ?? "",
        cell: ({ row }) => {
          const last = row.original.k.lastAudit;
          if (!last) return <span className="text-muted-foreground">{t("never")}</span>;
          const days = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
          return <span className="text-muted-foreground" title={new Date(last).toLocaleDateString(locale)}>{t("daysAgo", { count: days })}</span>;
        },
      },
    ],
    [t, locale],
  );

  return (
    <div className="space-y-3">
      <DataTable columns={columns} data={rows} minWidth={760} />
      <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-primary size-2.5 rounded-[3px]" /> {t("atTarget", { pct: TARGET })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-below-target size-2.5 rounded-[3px]" /> {t("belowTarget")}
        </span>
      </div>
    </div>
  );
}

function Escalated({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  const t = useTranslations("dashboard");
  const session = useRequiredSession();
  const dur = useDuration();
  return (
    <Section
      title={t("escalated")}
      trailing={
        session.hasAny("issue.view") && (
          <Link href="/issues" className="text-primary text-[13px] font-bold">
            {t("allIssues")}
          </Link>
        )
      }
    >
      {data.escalated.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("nothingEscalated")}</p>
      ) : (
        <div className="divide-y">
          {data.escalated.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3.5 py-3">
              <Pill tone="danger">{t("late", { time: dur.late(i.due_at) })}</Pill>
              <span className="min-w-48 flex-1 text-sm font-semibold">
                {i.title} · {session.outlets.get(i.outlet_id)?.name}
              </span>
              <span className="text-muted-foreground text-[13px]">{i.assigned_to ? t("assigned") : t("notAssigned")}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
