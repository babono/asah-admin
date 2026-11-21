"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Check, Copy, Loader2, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { DataTable, type AdminColumn } from "@/components/admin/data-table";
import { FormCheckbox, FormInput, FormSelect, FormTextarea } from "@/components/admin/form-fields";
import { EmptyState, PageHeader, Pill, Section } from "@/components/admin/page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Enums } from "@/lib/database.types";
import { friendlyError } from "@/lib/errors";
import { fmtTime } from "@/lib/format";
import { useRequiredSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { usePositions, useTemplate, useTemplateActions, type Item, type Schedule, type TemplateDetail } from "./api";

type Actions = ReturnType<typeof useTemplateActions>;

/**
 * Checklist template builder: settings, positions, items, schedules, publish
 * (PRD A1, A2, A4; design screen 9). The page pattern for the other builders.
 */
export function TemplateBuilder() {
  const { id } = useParams<{ id: string }>();
  const template = useTemplate(id);
  if (template.isPending) return <Loader2 className="text-primary mx-auto my-16 size-7 animate-spin" />;
  if (template.isError) return <EmptyState>{friendlyError(template.error)}</EmptyState>;
  return <Builder d={template.data} />;
}

function Builder({ d }: { d: TemplateDetail }) {
  const t = useTranslations("builder");
  const tc = useTranslations("common");
  const actions = useTemplateActions(d, {
    saved: tc("saved"),
    published: t("published"),
    newVersion: t("newVersionDone"),
    archived: t("archived"),
    restored: t("restored"),
  });
  const photos = d.items.filter((i) => i.photo_rule === "required" || i.answer_type === "photo").length;
  const archived = Boolean(d.template.archived_at);

  return (
    <>
      <PageHeader
        breadcrumb={
          <>
            <Link href="/checklists" className="text-primary">
              {t("breadcrumb")}
            </Link>{" "}
            / {d.template.name}
          </>
        }
        title={d.template.name}
        subtitle={d.isAudit ? t("auditSubtitle") : t("routineSubtitle")}
        actions={
          <>
            <Pill tone={d.isDraft ? "warning" : "primary"}>
              v{d.latest.version} · {d.isDraft ? "draft" : t("published").toLowerCase()}
            </Pill>
            <Button variant="outline" className="h-11 px-4" disabled={actions.archive.isPending} onClick={() => actions.archive.mutate()}>
              {archived ? <ArchiveRestore /> : <Archive />}
              {archived ? tc("restore") : tc("archive")}
            </Button>
            {!d.isDraft && (
              <Button variant="outline" className="h-11 px-4" disabled={actions.newVersion.isPending} onClick={() => actions.newVersion.mutate()}>
                <Copy /> {t("newVersion")}
              </Button>
            )}
            {d.isDraft && <PublishButton d={d} actions={actions} />}
          </>
        }
      />

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[999_1_520px]">
          <Section title={t("settings")}>
            <SettingsForm d={d} actions={actions} />
            {!d.isAudit && <PositionsPicker d={d} actions={actions} />}
          </Section>
          <Section title={t("items")} trailing={<span className="text-muted-foreground text-[13px]">{t("itemsSummary", { items: d.items.length, photos })}</span>}>
            <ItemsEditor d={d} actions={actions} />
          </Section>
        </div>
        <aside className="flex-[1_1_300px] space-y-4">
          {!d.isAudit && (
            <Section title={t("schedule")}>
              <SchedulesEditor d={d} actions={actions} />
            </Section>
          )}
          <Section title={t("proof")}>
            <ul className="space-y-2 text-sm">
              {[t("proofCamera"), t("proofTime"), t("proofPlace")].map((line) => (
                <li key={line} className="flex items-center gap-2.5">
                  <Check className="text-primary size-[18px]" /> {line}
                </li>
              ))}
            </ul>
          </Section>
        </aside>
      </div>
    </>
  );
}

function PublishButton({ d, actions }: { d: TemplateDetail; actions: Actions }) {
  const t = useTranslations("builder");
  const tc = useTranslations("common");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button className="h-11 px-5 font-bold" disabled={d.items.length === 0 || actions.publish.isPending}>
          {tc("publish")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("publishTitle", { version: d.latest.version })}</AlertDialogTitle>
          <AlertDialogDescription>{t("publishBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => actions.publish.mutate()}>{tc("publish")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------- settings

const severities = ["low", "medium", "high"] as const;

function SettingsForm({ d, actions }: { d: TemplateDetail; actions: Actions }) {
  const t = useTranslations("builder");
  const tc = useTranslations("common");
  const session = useRequiredSession();
  const brands = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of session.outlets.values()) m.set(o.brandId, o.brandName ?? "");
    return [...m.entries()];
  }, [session]);

  const schema = z.object({
    name: z.string().trim().min(1),
    brand_id: z.string().nullable(),
    fail_issue_severity: z.enum(severities),
    fail_issue_sla_hours: z.coerce.number<string>().int().min(1).max(720),
  });
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    values: {
      name: d.template.name,
      brand_id: d.template.brand_id,
      fail_issue_severity: d.template.fail_issue_severity,
      fail_issue_sla_hours: String(d.template.fail_issue_sla_hours),
    },
  });

  return (
    <form onSubmit={form.handleSubmit((v) => actions.saveSettings.mutate(v))} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput control={form.control} name="name" label={t("name")} />
        <FormSelect
          control={form.control}
          name="brand_id"
          label={t("brands")}
          options={[{ value: null, label: tc("allBrands") }, ...brands.map(([value, label]) => ({ value, label }))]}
        />
        <FormSelect
          control={form.control}
          name="fail_issue_severity"
          label={t("failSeverity")}
          options={[
            { value: "low", label: t("severityLow") },
            { value: "medium", label: t("severityMedium") },
            { value: "high", label: t("severityHigh") },
          ]}
        />
        <FormInput control={form.control} name="fail_issue_sla_hours" label={t("slaHours")} type="number" min={1} />
      </div>
      <FieldDescription>{t("failHint")}</FieldDescription>
      <Button type="submit" className="h-10 px-5 font-bold" disabled={!form.formState.isDirty || actions.saveSettings.isPending}>
        {actions.saveSettings.isPending && <Loader2 className="animate-spin" />}
        {tc("save")}
      </Button>
    </form>
  );
}

function PositionsPicker({ d, actions }: { d: TemplateDetail; actions: Actions }) {
  const t = useTranslations("builder");
  const positions = usePositions();
  return (
    <div className="mt-6 space-y-2">
      <p className="text-text-strong text-[13px] font-semibold">{t("positions")}</p>
      <div className="flex flex-wrap gap-2">
        {(positions.data ?? []).map((p) => {
          const on = d.positionIds.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              disabled={actions.togglePosition.isPending}
              onClick={() => actions.togglePosition.mutate({ positionId: p.id, on: !on })}
              className={cn(
                "rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-bold",
                on ? "border-primary bg-secondary text-primary" : "border-dashed border-[#a9aea9] text-text-strong",
              )}
            >
              {on ? p.name : `+ ${p.name}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- items

const answerTypes = ["yes_no", "number", "text", "photo"] as const;
const photoRules = ["none", "optional", "required"] as const;

function useAnswerLabels() {
  const t = useTranslations("builder");
  return {
    answer: { yes_no: t("answerYesNo"), number: t("answerNumber"), text: t("answerText"), photo: t("answerPhoto") } satisfies Record<
      Enums<"answer_type">,
      string
    >,
    photo: { none: t("photoNone"), optional: t("photoOptional"), required: t("photoRequired") } satisfies Record<Enums<"photo_rule">, string>,
  };
}

/** Same rule as app.compute_response_passed() in asah-be. */
function failsWhen(i: Item, t: ReturnType<typeof useTranslations<"builder">>) {
  const parts: string[] = [];
  if (i.answer_type === "yes_no" && i.fail_on_no) parts.push(t("fails.no"));
  if (i.answer_type === "number") {
    if (i.min_value != null && i.max_value != null) parts.push(t("fails.outside", { min: i.min_value, max: i.max_value }));
    else if (i.min_value != null) parts.push(t("fails.below", { min: i.min_value }));
    else if (i.max_value != null) parts.push(t("fails.above", { max: i.max_value }));
  }
  if (i.photo_rule === "required") parts.push(t("fails.noPhoto"));
  return parts.length ? parts.join(t("fails.or")) : "–";
}

function ItemsEditor({ d, actions }: { d: TemplateDetail; actions: Actions }) {
  const t = useTranslations("builder");
  const tc = useTranslations("common");
  const labels = useAnswerLabels();
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const editable = d.isDraft;

  const columns = useMemo<AdminColumn<Item>[]>(
    () => [
      {
        id: "label",
        header: t("colItem"),
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <p className="font-semibold">{row.original.label}</p>
            {row.original.help_text && <p className="text-muted-foreground text-xs">{row.original.help_text}</p>}
          </div>
        ),
      },
      {
        id: "answer",
        header: t("colAnswer"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.answer_type === "number" && row.original.unit
            ? `${labels.answer.number}, ${row.original.unit}`
            : labels.answer[row.original.answer_type],
      },
      {
        id: "fails",
        header: t("colFails"),
        enableSorting: false,
        cell: ({ row }) => <span className="text-muted-foreground">{failsWhen(row.original, t)}</span>,
      },
      {
        id: "photo",
        header: t("colPhoto"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.photo_rule === "required" || row.original.answer_type === "photo" ? (
            <Pill tone="warning">{labels.photo.required}</Pill>
          ) : (
            <span className="text-muted-foreground">{labels.photo[row.original.photo_rule]}</span>
          ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) =>
          editable ? (
            <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
              <IconButton label={tc("moveUp")} disabled={row.index === 0} onClick={() => actions.moveItem.mutate({ index: row.index, delta: -1 })}>
                <ArrowUp />
              </IconButton>
              <IconButton
                label={tc("moveDown")}
                disabled={row.index === d.items.length - 1}
                onClick={() => actions.moveItem.mutate({ index: row.index, delta: 1 })}
              >
                <ArrowDown />
              </IconButton>
              <IconButton label={tc("edit")} onClick={() => setEditing(row.original)}>
                <Pencil />
              </IconButton>
              <IconButton label={tc("delete")} danger onClick={() => actions.deleteItem.mutate(row.original.id)}>
                <Trash2 />
              </IconButton>
            </div>
          ) : null,
      },
    ],
    [t, tc, labels, editable, actions, d.items.length],
  );

  return (
    <div className="space-y-3">
      {!editable && (
        <div className="bg-info-soft text-info flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold">
          <Lock className="size-4" /> {t("frozen")}
        </div>
      )}
      <DataTable columns={columns} data={d.items} minWidth={680} onRowClick={editable ? (i) => setEditing(i) : undefined} />
      {editable && (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="text-text-strong min-h-12 w-full rounded-xl border-[1.5px] border-dashed border-[#a9aea9] text-sm font-semibold"
        >
          {t("addItem")}
        </button>
      )}
      <ItemDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        item={editing === "new" ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        actions={actions}
      />
    </div>
  );
}

function ItemDialog({ item, open, onClose, actions }: { item: Item | null; open: boolean; onClose: () => void; actions: Actions }) {
  const t = useTranslations("builder");
  const tc = useTranslations("common");
  const labels = useAnswerLabels();
  const number = z.string().trim().refine((v) => v === "" || !Number.isNaN(Number(v)));
  const schema = z
    .object({
      label: z.string().trim().min(1),
      help_text: z.string().trim(),
      answer_type: z.enum(answerTypes),
      photo_rule: z.enum(photoRules),
      min_value: number,
      max_value: number,
      unit: z.string().trim(),
      fail_on_no: z.boolean(),
    })
    .refine((v) => v.min_value === "" || v.max_value === "" || Number(v.min_value) <= Number(v.max_value), {
      path: ["max_value"],
      message: t("minMax"),
    });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      label: item?.label ?? "",
      help_text: item?.help_text ?? "",
      answer_type: item?.answer_type ?? "yes_no",
      photo_rule: item?.photo_rule ?? "none",
      min_value: item?.min_value?.toString() ?? "",
      max_value: item?.max_value?.toString() ?? "",
      unit: item?.unit ?? "",
      fail_on_no: item?.fail_on_no ?? true,
    },
  });
  const type = useWatch({ control: form.control, name: "answer_type" });

  const submit = form.handleSubmit(async (v) => {
    const isNumber = v.answer_type === "number";
    await actions.saveItem.mutateAsync({
      id: item?.id,
      values: {
        label: v.label,
        help_text: v.help_text || null,
        answer_type: v.answer_type,
        // A photo-only item always needs its photo.
        photo_rule: v.answer_type === "photo" ? "required" : v.photo_rule,
        min_value: isNumber && v.min_value !== "" ? Number(v.min_value) : null,
        max_value: isNumber && v.max_value !== "" ? Number(v.max_value) : null,
        unit: isNumber && v.unit ? v.unit : null,
        fail_on_no: v.fail_on_no,
      },
    });
    onClose();
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{item ? t("editItem") : t("newItem")}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="label" label={t("itemLabel")} placeholder={t("itemLabelPlaceholder")} autoFocus />
          <FormTextarea control={form.control} name="help_text" label={t("helpText")} rows={2} />
          <FormSelect
            control={form.control}
            name="answer_type"
            label={t("answerType")}
            options={answerTypes.map((value) => ({ value, label: labels.answer[value] }))}
          />
          {type === "number" && (
            <div className="grid grid-cols-3 gap-3">
              <FormInput control={form.control} name="min_value" label={t("min")} inputMode="decimal" />
              <FormInput control={form.control} name="max_value" label={t("max")} inputMode="decimal" />
              <FormInput control={form.control} name="unit" label={t("unit")} placeholder="°C" />
            </div>
          )}
          {type !== "photo" && (
            <FormSelect
              control={form.control}
              name="photo_rule"
              label={t("photo")}
              options={photoRules.map((value) => ({ value, label: labels.photo[value] }))}
            />
          )}
          {type === "yes_no" && <FormCheckbox control={form.control} name="fail_on_no" label={t("failOnNo")} />}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" className="h-10 font-bold" disabled={actions.saveItem.isPending}>
              {actions.saveItem.isPending && <Loader2 className="animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- schedules

const shifts = ["opening", "mid", "closing", "other"] as const;
const days = [1, 2, 3, 4, 5, 6, 7] as const;

function useShiftLabels() {
  const t = useTranslations("builder");
  return { opening: t("shiftOpening"), mid: t("shiftMid"), closing: t("shiftClosing"), other: t("shiftOther") } satisfies Record<
    Enums<"shift_type">,
    string
  >;
}

function SchedulesEditor({ d, actions }: { d: TemplateDetail; actions: Actions }) {
  const t = useTranslations("builder");
  const tc = useTranslations("common");
  const td = useTranslations("days");
  const session = useRequiredSession();
  const shiftLabels = useShiftLabels();
  const [editing, setEditing] = useState<Schedule | "new" | null>(null);

  return (
    <div className="space-y-2">
      {d.schedules.length === 0 && <p className="text-muted-foreground text-sm">{t("noSchedule")}</p>}
      {d.schedules.map((s) => (
        <div key={s.id} className="flex items-center gap-3 border-b py-2 last:border-0">
          <Switch
            checked={s.active}
            onCheckedChange={(active) => actions.toggleSchedule.mutate({ id: s.id, active })}
            aria-label={shiftLabels[s.shift]}
          />
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(s)}>
            <p className="text-sm font-bold">{t("dueAt", { shift: shiftLabels[s.shift], time: fmtTime(s.due_time) })}</p>
            <p className="text-muted-foreground text-[13px]">
              {s.outlet_id ? (session.outlets.get(s.outlet_id)?.name ?? "–") : tc("allOutlets")} ·{" "}
              {s.days_of_week.length === 7 ? t("everyDay") : s.days_of_week.map((n) => td(String(n))).join(" ")}
            </p>
          </button>
          <IconButton label={tc("delete")} danger onClick={() => actions.deleteSchedule.mutate(s.id)}>
            <Trash2 />
          </IconButton>
        </div>
      ))}
      <Button variant="ghost" className="text-primary -ml-2 font-bold" onClick={() => setEditing("new")}>
        <Plus /> {t("addSchedule")}
      </Button>
      <p className="text-muted-foreground border-t pt-3 text-[13px]">{t("scheduleHint")}</p>
      <ScheduleDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        d={d}
        schedule={editing === "new" ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        actions={actions}
      />
    </div>
  );
}

function ScheduleDialog({
  d,
  schedule,
  open,
  onClose,
  actions,
}: {
  d: TemplateDetail;
  schedule: Schedule | null;
  open: boolean;
  onClose: () => void;
  actions: Actions;
}) {
  const t = useTranslations("builder");
  const tc = useTranslations("common");
  const td = useTranslations("days");
  const shiftLabels = useShiftLabels();
  const session = useRequiredSession();
  // A brand template only runs at that brand's outlets.
  const outlets = [...session.outlets.values()].filter((o) => !d.template.brand_id || o.brandId === d.template.brand_id);

  const schema = z.object({
    outlet_id: z.string().nullable(),
    shift: z.enum(shifts),
    due_time: z.string().regex(/^\d{2}:\d{2}$/),
    days_of_week: z.array(z.number()).min(1, t("pickDay")),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      outlet_id: schedule?.outlet_id ?? null,
      shift: schedule?.shift ?? "opening",
      due_time: schedule ? fmtTime(schedule.due_time) : "09:00",
      days_of_week: schedule?.days_of_week ?? [...days],
    },
  });
  const picked = useWatch({ control: form.control, name: "days_of_week" });

  const submit = form.handleSubmit(async (v) => {
    await actions.saveSchedule.mutateAsync({
      id: schedule?.id,
      values: { ...v, days_of_week: [...v.days_of_week].sort() },
    });
    onClose();
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{schedule ? t("editSchedule") : t("addSchedule")}</DialogTitle>
          </DialogHeader>
          <FormSelect
            control={form.control}
            name="outlet_id"
            label={t("outlet")}
            options={[
              { value: null, label: d.template.brand_id ? t("everyBrandOutlet") : t("everyOutlet") },
              ...outlets.map((o) => ({ value: o.id, label: o.name })),
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormSelect
              control={form.control}
              name="shift"
              label={t("shift")}
              options={shifts.map((value) => ({ value, label: shiftLabels[value] }))}
            />
            <FormInput control={form.control} name="due_time" label={t("due")} type="time" />
          </div>
          <div className="space-y-2">
            <FieldLabel>{t("days")}</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {days.map((n) => {
                const on = picked.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      form.setValue("days_of_week", on ? picked.filter((x) => x !== n) : [...picked, n], { shouldValidate: true })
                    }
                    className={cn(
                      "min-h-9 min-w-11 rounded-full border-[1.5px] px-2 text-[13px] font-bold",
                      on ? "border-primary bg-secondary text-primary" : "border-input text-muted-foreground",
                    )}
                  >
                    {td(String(n))}
                  </button>
                );
              })}
            </div>
            <FieldError errors={[form.formState.errors.days_of_week]} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" className="h-10 font-bold" disabled={actions.saveSchedule.isPending}>
              {actions.saveSchedule.isPending && <Loader2 className="animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(danger && "text-destructive hover:text-destructive")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
