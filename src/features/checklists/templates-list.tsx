"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { DataTable, type AdminColumn } from "@/components/admin/data-table";
import { FormInput } from "@/components/admin/form-fields";
import { PageHeader, Pill, Section } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useCreateTemplate, useTemplates, type TemplateRow } from "./api";

/** Checklist and audit templates (PRD A1). */
export function TemplatesList() {
  const t = useTranslations("checklists");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const router = useRouter();
  const templates = useTemplates();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const columns = useMemo<AdminColumn<TemplateRow>[]>(
    () => [
      {
        id: "name",
        header: t("colTemplate"),
        accessorFn: (r) => r.name,
        cell: ({ row }) => (
          <span className={cn("font-bold", row.original.archived_at && "text-muted-foreground")}>{row.original.name}</span>
        ),
      },
      {
        id: "kind",
        header: t("colKind"),
        accessorFn: (r) => r.kind,
        cell: ({ row }) =>
          row.original.kind === "audit" ? <Pill tone="info">{t("audit")}</Pill> : <Pill>{t("daily")}</Pill>,
      },
      {
        id: "brand",
        header: t("colBrands"),
        accessorFn: (r) => r.brands?.name ?? "",
        cell: ({ row }) => row.original.brands?.name ?? tc("allBrands"),
      },
      {
        id: "positions",
        header: t("colPositions"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.checklist_template_positions.map((p) => p.positions?.name).filter(Boolean).join(", ") || "–",
      },
      {
        id: "schedule",
        header: t("colSchedule"),
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.kind === "audit") return t("onVisit");
          const active = row.original.checklist_schedules.filter((s) => s.active);
          if (active.length === 0) return <span className="text-muted-foreground">{t("notScheduled")}</span>;
          return [...new Set(active.map((s) => `${s.shift} ${fmtTime(s.due_time)}`))].join(", ");
        },
      },
      {
        id: "version",
        header: t("colVersion"),
        enableSorting: false,
        cell: ({ row }) => {
          const latest = [...row.original.checklist_template_versions].sort((a, b) => b.version - a.version)[0];
          if (!latest) return "–";
          return latest.published_at ? (
            <Pill>{t("versionPublished", { version: latest.version })}</Pill>
          ) : (
            <Pill tone="warning">{t("versionDraft", { version: latest.version })}</Pill>
          );
        },
      },
    ],
    [t, tc],
  );

  const rows = useMemo(
    () => (templates.data ?? []).filter((r) => showArchived || !r.archived_at),
    [templates.data, showArchived],
  );

  return (
    <>
      <PageHeader
        breadcrumb={tn("aksi")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <label className="text-text-strong flex items-center gap-2 text-sm font-semibold">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
              {tc("showArchived")}
            </label>
            <Button className="h-11 px-4 font-bold" onClick={() => setCreating(true)}>
              <Plus /> {t("new")}
            </Button>
          </>
        }
      />
      <Section>
        {templates.isPending ? (
          <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />
        ) : templates.isError ? (
          <p className="text-destructive">{String(templates.error.message)}</p>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            minWidth={860}
            empty={t("empty")}
            onRowClick={(r) => router.push(`/checklists/${r.id}`)}
          />
        )}
      </Section>
      <NewTemplateDialog open={creating} onOpenChange={setCreating} onCreated={(id) => router.push(`/checklists/${id}`)} />
    </>
  );
}

function NewTemplateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("checklists");
  const tc = useTranslations("common");
  const create = useCreateTemplate();
  const schema = z.object({ name: z.string().trim().min(1), kind: z.enum(["routine", "audit"]) });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", kind: "routine" },
  });
  const kind = useWatch({ control: form.control, name: "kind" });

  const submit = form.handleSubmit(async (v) => {
    const id = await create.mutateAsync(v);
    form.reset();
    onOpenChange(false);
    onCreated(id);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{t("new")}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="name" label={t("name")} placeholder={t("namePlaceholder")} autoFocus />
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("kind")}</legend>
            {(["routine", "audit"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => form.setValue("kind", k)}
                className={cn(
                  "w-full rounded-xl border-[1.5px] p-3 text-left",
                  kind === k ? "border-primary bg-secondary" : "border-input",
                )}
              >
                <span className="block font-bold">{k === "routine" ? t("kindRoutine") : t("kindAudit")}</span>
                <span className="text-muted-foreground text-[13px]">
                  {k === "routine" ? t("kindRoutineHint") : t("kindAuditHint")}
                </span>
              </button>
            ))}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" className="h-10 font-bold" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              {tc("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
