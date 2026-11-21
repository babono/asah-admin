"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { DataTable, type AdminColumn } from "@/components/admin/data-table";
import { NULL_OPTION } from "@/components/admin/form-fields";
import { EmptyState, PageHeader, Section } from "@/components/admin/page";
import { useSupabase } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Json, Tables } from "@/lib/database.types";
import { friendlyError, unwrap } from "@/lib/errors";
import { usePeople } from "@/features/issues/api";

type Entry = Tables<"admin_audit_log">;
const PAGE = 50;
const TABLES = [
  "profiles", "user_roles", "roles", "role_permissions", "positions", "departments", "outlets", "brands", "areas",
  "app_settings", "learning_paths", "learning_path_items", "checklist_templates", "checklist_schedules",
];

const asObject = (j: Json | null): Record<string, Json | undefined> => (j && typeof j === "object" && !Array.isArray(j) ? j : {});

/** Fields that changed, e.g. "status: active → inactive". */
function summary(e: Entry) {
  const before = asObject(e.before);
  const after = asObject(e.after);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((k) => k !== "updated_at" && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => `${k}: ${fmtValue(before[k])} → ${fmtValue(after[k])}`)
    .join("; ");
}
const fmtWhen = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const nameOf = (people: Map<string, string> | undefined, id: string | null, system: string) =>
  id ? (people?.get(id) ?? "…") : system;

const fmtValue = (v: Json | undefined) => (v === undefined || v === null ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Every admin and permission change: who, what, when, before and after (PRD F9, R5). */
export function AuditLogPage() {
  const t = useTranslations("auditLog");
  const tn = useTranslations("nav");
  const locale = useLocale();
  const supabase = useSupabase();
  const [table, setTable] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Entry | null>(null);

  const log = useQuery({
    queryKey: ["audit-log", table, page],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase.from("admin_audit_log").select("*");
      if (table) q = q.eq("table_name", table);
      return unwrap(await q.order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1));
    },
  });
  const views = useQuery({
    queryKey: ["rating-access-log"],
    queryFn: async () =>
      unwrap(await supabase.from("mentor_rating_access_log").select("*").order("viewed_at", { ascending: false }).limit(100)),
  });
  const people = usePeople([
    ...(log.data ?? []).map((e) => e.actor_id),
    ...(views.data ?? []).flatMap((v) => [v.viewer_id, v.mentor_id]),
  ]);
  const who = (id: string | null) => nameOf(people.data, id, t("system"));
  const when = (iso: string) => fmtWhen(iso, locale);

  const columns = useMemo<AdminColumn<Entry>[]>(
    () => [
      {
        id: "when",
        header: t("colWhen"),
        enableSorting: false,
        cell: ({ row }) => <span className="whitespace-nowrap">{fmtWhen(row.original.created_at, locale)}</span>,
      },
      { id: "who", header: t("colWho"), enableSorting: false, cell: ({ row }) => nameOf(people.data, row.original.actor_id, t("system")) },
      { id: "action", header: t("colAction"), enableSorting: false, cell: ({ row }) => <code className="text-xs">{row.original.action}</code> },
      { id: "record", header: t("colRecord"), enableSorting: false, cell: ({ row }) => row.original.table_name },
      {
        id: "change",
        header: t("colChange"),
        enableSorting: false,
        cell: ({ row }) => <span className="text-muted-foreground line-clamp-2 max-w-md text-[13px]">{summary(row.original)}</span>,
      },
    ],
    [t, people.data, locale],
  );

  return (
    <>
      <PageHeader
        breadcrumb={tn("system")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Select
            value={table ?? NULL_OPTION}
            onValueChange={(v) => {
              setTable(v === NULL_OPTION ? null : v);
              setPage(0);
            }}
          >
            <SelectTrigger className="h-11 w-56 bg-white" aria-label={t("recordType")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NULL_OPTION}>{t("everything")}</SelectItem>
              {TABLES.map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <Section>
        {log.isPending ? (
          <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />
        ) : log.isError ? (
          <EmptyState>{friendlyError(log.error)}</EmptyState>
        ) : (
          <>
            <DataTable columns={columns} data={log.data} minWidth={860} empty={t("empty")} onRowClick={setOpen} />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
                {t("newer")}
              </Button>
              <Button variant="ghost" disabled={log.data.length < PAGE} onClick={() => setPage(page + 1)}>
                {t("older")}
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section title={t("ratingViews")}>
        {(views.data ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noViews")}</p>
        ) : (
          <div className="divide-y text-sm">
            {views.data!.map((v) => (
              <div key={v.id} className="flex flex-wrap gap-x-4 py-2">
                <span className="text-muted-foreground w-44">{when(v.viewed_at)}</span>
                <span>
                  <span className="font-semibold">{who(v.viewer_id)}</span> → {who(v.mentor_id)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {open.action} · {open.table_name} · {who(open.actor_id)}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["before", "after"] as const).map((k) => (
                <div key={k} className="min-w-0">
                  <p className="mb-1 text-sm font-bold">{t(k)}</p>
                  <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs">{JSON.stringify(open[k], null, 2) ?? "∅"}</pre>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
