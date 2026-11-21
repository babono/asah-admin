"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DataTable, type AdminColumn } from "@/components/admin/data-table";
import { DialogActions } from "@/components/admin/dialog-actions";
import { FormCheckbox, FormInput, FormSelect } from "@/components/admin/form-fields";
import { IconButton } from "@/components/admin/icon-button";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldDescription } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useModules, type ModuleRow } from "@/features/modules/api";
import { usePositions } from "@/features/org/api";
import { friendlyError } from "@/lib/errors";

import { usePath, usePathActions, type Path, type PathItem } from "./api";

const DUE_OPTIONS = [1, 7, 30, 60, 90] as const;

/** Learning path per position: order, mandatory or optional, due window (PRD T6). */
export function PathsPage() {
  const t = useTranslations("paths");
  const tn = useTranslations("nav");
  const positions = usePositions();
  const [picked, setPicked] = useState<string | null>(null);
  const positionId = picked ?? positions.data?.[0]?.id ?? null;
  const position = positions.data?.find((p) => p.id === positionId);

  return (
    <>
      <PageHeader
        breadcrumb={tn("asuh")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          positions.data && positions.data.length > 0 ? (
            <Select value={positionId ?? undefined} onValueChange={setPicked}>
              <SelectTrigger className="h-11 w-72 bg-white" aria-label={t("position")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {positions.data.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.departments?.name} · {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null
        }
      />
      {positions.isPending ? (
        <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />
      ) : !position ? (
        <EmptyState>{t("noPositions")}</EmptyState>
      ) : (
        <PathEditor key={position.id} positionId={position.id} positionName={position.name} />
      )}
    </>
  );
}

function PathEditor({ positionId, positionName }: { positionId: string; positionName: string }) {
  const t = useTranslations("paths");
  const tc = useTranslations("common");
  const path = usePath(positionId);
  const modules = useModules();
  const actions = usePathActions(positionId, { saved: tc("saved"), added: t("added"), removed: t("removed") });
  const [dialog, setDialog] = useState<"add" | "rename" | null>(null);
  const [removing, setRemoving] = useState<PathItem | null>(null);

  const byId = useMemo(() => new Map((modules.data ?? []).map((m) => [m.id, m])), [modules.data]);
  const title = (id: string) => byId.get(id)?.latest?.title ?? "–";
  const items = useMemo(() => path.data?.items ?? [], [path.data]);

  const columns = useMemo<AdminColumn<PathItem>[]>(
    () => [
      { id: "order", header: t("colOrder"), enableSorting: false, cell: ({ row }) => row.index + 1 },
      {
        id: "module",
        header: t("colModule"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{byId.get(row.original.module_id)?.latest?.title ?? "–"}</span>
            {!byId.get(row.original.module_id)?.published && <Pill tone="warning">{t("notPublished")}</Pill>}
          </span>
        ),
      },
      {
        id: "due",
        header: t("colDue"),
        enableSorting: false,
        cell: ({ row }) => (
          <Select
            value={String(row.original.due_days)}
            onValueChange={(v) => actions.updateItem.mutate({ id: row.original.id, due_days: Number(v) })}
          >
            <SelectTrigger className="h-9 w-36" aria-label={t("colDue")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([...DUE_OPTIONS, row.original.due_days])].sort((a, b) => a - b).map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {dueLabel(t, d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
      {
        id: "mandatory",
        header: t("colMandatory"),
        enableSorting: false,
        cell: ({ row }) => (
          <Switch
            checked={row.original.is_mandatory}
            aria-label={t("mandatory")}
            onCheckedChange={(v) => actions.updateItem.mutate({ id: row.original.id, is_mandatory: v })}
          />
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-0.5">
            <IconButton
              label={tc("moveUp")}
              disabled={row.index === 0}
              onClick={() => actions.moveItem.mutate({ a: row.original, b: items[row.index - 1] })}
            >
              <ArrowUp />
            </IconButton>
            <IconButton
              label={tc("moveDown")}
              disabled={row.index === items.length - 1}
              onClick={() => actions.moveItem.mutate({ a: row.original, b: items[row.index + 1] })}
            >
              <ArrowDown />
            </IconButton>
            <IconButton label={t("remove")} danger onClick={() => setRemoving(row.original)}>
              <Trash2 />
            </IconButton>
          </div>
        ),
      },
    ],
    [t, tc, byId, items, actions.updateItem, actions.moveItem],
  );

  if (path.isPending) return <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />;
  if (path.isError) return <EmptyState>{friendlyError(path.error)}</EmptyState>;

  if (!path.data) {
    return (
      <Section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>{t("noPath")}</p>
          <Button
            className="h-10 font-bold"
            disabled={actions.createPath.isPending}
            onClick={() => actions.createPath.mutate(t("defaultName", { position: positionName }))}
          >
            <Plus /> {t("createPath")}
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <>
      <Section
        title={path.data.name}
        trailing={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDialog("rename")}>
              <Pencil /> {t("rename")}
            </Button>
            <Button className="h-10 font-bold" onClick={() => setDialog("add")}>
              <Plus /> {t("addModule")}
            </Button>
          </div>
        }
      >
        <DataTable columns={columns} data={items} minWidth={720} empty={t("empty")} />
      </Section>

      {dialog === "rename" && <RenameDialog path={path.data} actions={actions} onClose={() => setDialog(null)} />}
      {dialog === "add" && (
        <AddModuleDialog
          path={path.data}
          modules={(modules.data ?? []).filter((m) => !m.archived_at && !items.some((i) => i.module_id === m.id))}
          actions={actions}
          onClose={() => setDialog(null)}
        />
      )}
      {removing && (
        <AlertDialog open onOpenChange={(o) => !o && setRemoving(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("removeTitle", { module: title(removing.module_id) })}</AlertDialogTitle>
              <AlertDialogDescription>{t("removeBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => actions.removeItem.mutate(removing.id)}>{t("remove")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function dueLabel(t: ReturnType<typeof useTranslations<"paths">>, days: number) {
  return (DUE_OPTIONS as readonly number[]).includes(days) ? t(`due.${days as (typeof DUE_OPTIONS)[number]}`) : t("days", { count: days });
}

function RenameDialog({ path, actions, onClose }: { path: Path; actions: ReturnType<typeof usePathActions>; onClose: () => void }) {
  const t = useTranslations("paths");
  const tc = useTranslations("common");
  const schema = z.object({ name: z.string().trim().min(1) });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { name: path.name } });
  const submit = form.handleSubmit(async (v) => {
    await actions.renamePath.mutateAsync({ id: path.id, name: v.name });
    onClose();
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("renameTitle")}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="name" label={t("name")} autoFocus />
          <DialogActions busy={actions.renamePath.isPending} onCancel={onClose} save={tc("save")} cancel={tc("cancel")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddModuleDialog({
  path,
  modules,
  actions,
  onClose,
}: {
  path: Path;
  modules: ModuleRow[];
  actions: ReturnType<typeof usePathActions>;
  onClose: () => void;
}) {
  const t = useTranslations("paths");
  const tc = useTranslations("common");
  const schema = z.object({ module_id: z.string().min(1), due_days: z.string(), mandatory: z.boolean() });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { module_id: modules[0]?.id ?? "", due_days: "7", mandatory: true },
  });
  const submit = form.handleSubmit(async (v) => {
    await actions.addItem.mutateAsync({
      pathId: path.id,
      moduleId: v.module_id,
      dueDays: Number(v.due_days),
      mandatory: v.mandatory,
      sort: Math.max(0, ...path.items.map((i) => i.sort)) + 1,
    });
    onClose();
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("addTitle")}</DialogTitle>
          </DialogHeader>
          {modules.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("allAdded")}</p>
          ) : (
            <>
              <FormSelect
                control={form.control}
                name="module_id"
                label={t("module")}
                options={modules.map((m) => ({
                  value: m.id,
                  label: m.published ? (m.latest?.title ?? "–") : `${m.latest?.title ?? "–"} (${t("draftOnly")})`,
                }))}
              />
              <FormSelect
                control={form.control}
                name="due_days"
                label={t("dueBy")}
                options={DUE_OPTIONS.map((d) => ({ value: String(d), label: t(`due.${d}`) }))}
              />
              <FormCheckbox control={form.control} name="mandatory" label={t("mandatory")} />
              <FieldDescription>{t("addHint")}</FieldDescription>
            </>
          )}
          <DialogActions
            busy={actions.addItem.isPending}
            onCancel={onClose}
            save={tc("add")}
            cancel={tc("cancel")}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
