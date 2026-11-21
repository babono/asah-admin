"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { DataTable, type AdminColumn } from "@/components/admin/data-table";
import { NULL_OPTION } from "@/components/admin/form-fields";
import { EmptyState, PageHeader, Pill, Section } from "@/components/admin/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Enums } from "@/lib/database.types";
import { friendlyError } from "@/lib/errors";
import { useRequiredSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { sourceName, useAudits, useIssues, usePeople, type AuditRow, type IssueRow } from "./api";
import { IssueStatus } from "./issue-status";
import { AuditDialog } from "./audit-dialog";
import { IssueSheet } from "./issue-sheet";

const fmtDateTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Issues across the viewer's scope (PRD S1-S3) and visit audits (S4). */
export function IssuesPage() {
  const t = useTranslations("issues");
  const tn = useTranslations("nav");
  return (
    <>
      <PageHeader breadcrumb={tn("monitoring")} title={t("title")} subtitle={t("subtitle")} />
      <Tabs defaultValue="issues">
        <TabsList className="mb-4">
          <TabsTrigger value="issues">{t("tabIssues")}</TabsTrigger>
          <TabsTrigger value="audits">{t("tabAudits")}</TabsTrigger>
        </TabsList>
        <TabsContent value="issues">
          <IssuesTab />
        </TabsContent>
        <TabsContent value="audits">
          <AuditsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

function IssuesTab() {
  const t = useTranslations("issues");
  const locale = useLocale();
  const session = useRequiredSession();
  const [status, setStatus] = useState<Enums<"issue_status">>("open");
  const [outletId, setOutletId] = useState<string | null>(null);
  const [source, setSource] = useState<Enums<"issue_source"> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const issues = useIssues(status);

  const rows = useMemo(
    () => (issues.data ?? []).filter((i) => (!outletId || i.outlet_id === outletId) && (!source || i.source === source)),
    [issues.data, outletId, source],
  );
  const people = usePeople(rows.map((i) => i.assigned_to));
  const selected = issues.data?.find((i) => i.id === selectedId) ?? null;

  const columns = useMemo<AdminColumn<IssueRow>[]>(
    () => [
      { id: "title", header: t("colIssue"), accessorFn: (i) => i.title, cell: ({ row }) => <span className="font-semibold">{row.original.title}</span> },
      { id: "outlet", header: t("colOutlet"), accessorFn: (i) => session.outlets.get(i.outlet_id)?.name ?? "" },
      {
        id: "source",
        header: t("colSource"),
        enableSorting: false,
        cell: ({ row }) => (row.original.source === "manual" ? t("manual") : (sourceName(row.original) ?? "–")),
      },
      {
        id: "severity",
        header: t("colSeverity"),
        accessorFn: (i) => ({ low: 0, medium: 1, high: 2 })[i.severity],
        cell: ({ row }) => (
          <Pill tone={row.original.severity === "high" ? "danger" : row.original.severity === "medium" ? "warning" : "neutral"}>
            {t(`severity.${row.original.severity}`)}
          </Pill>
        ),
      },
      {
        id: "owner",
        header: t("colOwner"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.assigned_to ? (
            (people.data?.get(row.original.assigned_to) ?? "…")
          ) : (
            <span className="text-destructive font-semibold">{t("notAssigned")}</span>
          ),
      },
      {
        id: "deadline",
        header: t("colDeadline"),
        accessorFn: (i) => i.due_at,
        cell: ({ row }) => {
          const late = row.original.status === "open" && row.original.due_at < new Date().toISOString();
          return <span className={cn("tabular-nums", late && "text-destructive font-bold")}>{fmtDateTime(row.original.due_at, locale)}</span>;
        },
      },
      { id: "status", header: t("colStatus"), enableSorting: false, cell: ({ row }) => <IssueStatus issue={row.original} /> },
    ],
    [t, locale, session, people.data],
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={status} onValueChange={(v) => setStatus(v as Enums<"issue_status">)}>
          <TabsList>
            <TabsTrigger value="open">{t("open")}</TabsTrigger>
            <TabsTrigger value="fixed">{t("fixed")}</TabsTrigger>
            <TabsTrigger value="closed">{t("closed")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={outletId ?? NULL_OPTION} onValueChange={(v) => setOutletId(v === NULL_OPTION ? null : v)}>
          <SelectTrigger className="h-10 w-48 bg-white" aria-label={t("colOutlet")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NULL_OPTION}>{t("allOutlets")}</SelectItem>
            {session.outletsWith("issue.view").map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source ?? NULL_OPTION} onValueChange={(v) => setSource(v === NULL_OPTION ? null : (v as Enums<"issue_source">))}>
          <SelectTrigger className="h-10 w-44 bg-white" aria-label={t("colSource")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NULL_OPTION}>{t("anySource")}</SelectItem>
            <SelectItem value="checklist">{t("fromChecklist")}</SelectItem>
            <SelectItem value="audit">{t("fromAudit")}</SelectItem>
            <SelectItem value="manual">{t("manual")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Section>
        {issues.isPending ? (
          <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />
        ) : issues.isError ? (
          <EmptyState>{friendlyError(issues.error)}</EmptyState>
        ) : (
          <DataTable columns={columns} data={rows} minWidth={960} empty={t("empty")} onRowClick={(i) => setSelectedId(i.id)} />
        )}
      </Section>
      {selected && <IssueSheet issue={selected} onClose={() => setSelectedId(null)} />}
    </>
  );
}

function AuditsTab() {
  const t = useTranslations("issues");
  const locale = useLocale();
  const session = useRequiredSession();
  const audits = useAudits();
  const people = usePeople((audits.data ?? []).map((a) => a.conducted_by));
  const [open, setOpen] = useState<AuditRow | null>(null);

  const columns = useMemo<AdminColumn<AuditRow>[]>(
    () => [
      { id: "outlet", header: t("auditCol.outlet"), accessorFn: (a) => session.outlets.get(a.outlet_id)?.name ?? "", cell: ({ getValue }) => <span className="font-bold">{getValue() as string}</span> },
      { id: "form", header: t("auditCol.form"), enableSorting: false, cell: ({ row }) => row.original.checklist_template_versions?.checklist_templates?.name ?? "–" },
      { id: "by", header: t("auditCol.by"), enableSorting: false, cell: ({ row }) => (row.original.conducted_by ? (people.data?.get(row.original.conducted_by) ?? "…") : "–") },
      {
        id: "date",
        header: t("auditCol.date"),
        accessorFn: (a) => a.submitted_at ?? a.shift_date,
        cell: ({ row }) => (row.original.submitted_at ? fmtDateTime(row.original.submitted_at, locale) : <Pill tone="warning">{t("inProgress")}</Pill>),
      },
      {
        id: "score",
        header: t("auditCol.score"),
        accessorFn: (a) => a.compliance_pct ?? -1,
        cell: ({ row }) => (row.original.compliance_pct == null ? "–" : `${Math.round(row.original.compliance_pct)}%`),
      },
      {
        id: "findings",
        header: t("auditCol.findings"),
        accessorFn: (a) => a.failed_count ?? 0,
        cell: ({ row }) =>
          row.original.status === "submitted" ? (
            <span className={cn((row.original.failed_count ?? 0) > 0 && "text-destructive font-bold")}>
              {t("findingsCount", { count: row.original.failed_count ?? 0 })}
            </span>
          ) : (
            "–"
          ),
      },
    ],
    [t, locale, session, people.data],
  );

  return (
    <Section>
      {audits.isPending ? (
        <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />
      ) : audits.isError ? (
        <EmptyState>{friendlyError(audits.error)}</EmptyState>
      ) : (
        <DataTable columns={columns} data={audits.data} minWidth={820} empty={t("auditsEmpty")} onRowClick={setOpen} />
      )}
      {open && <AuditDialog audit={open} onClose={() => setOpen(null)} />}
    </Section>
  );
}
