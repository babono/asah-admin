"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Loader2, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DialogActions } from "@/components/admin/dialog-actions";
import { FormInput } from "@/components/admin/form-fields";
import { IconButton } from "@/components/admin/icon-button";
import { EmptyState, PageHeader, Pill, Section } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldDescription } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";

import { useDepartments, useOrgActions, type Department, type Position } from "./api";

type Actions = ReturnType<typeof useOrgActions>;
type Editing =
  | { kind: "department"; department: Department | null }
  | { kind: "position"; department: Department; position: Position | null }
  | null;

/** Departments, positions and levels (PRD F2). */
export function OrgPage() {
  const t = useTranslations("org");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const departments = useDepartments();
  const actions = useOrgActions({ saved: tc("saved"), archived: tc("archivedDone"), restored: tc("restoredDone") });
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);

  const all = departments.data ?? [];
  const visible = all.filter((d) => showArchived || !d.archived_at);

  function move(index: number, delta: -1 | 1) {
    const ids = visible.map((d) => d.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    actions.reorderDepartments.mutate(ids);
  }

  return (
    <>
      <PageHeader
        breadcrumb={tn("setup")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <label className="text-text-strong flex items-center gap-2 text-sm font-semibold">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
              {tc("showArchived")}
            </label>
            <Button className="h-11 px-4 font-bold" onClick={() => setEditing({ kind: "department", department: null })}>
              <Plus /> {t("newDepartment")}
            </Button>
          </>
        }
      />

      {departments.isPending ? (
        <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />
      ) : departments.isError ? (
        <EmptyState>{friendlyError(departments.error)}</EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        visible.map((d, i) => (
          <Section
            key={d.id}
            title={
              <span className="flex items-center gap-2">
                <span className={cn(d.archived_at && "text-muted-foreground")}>{d.name}</span>
                {d.archived_at && <Pill tone="neutral">{t("archived")}</Pill>}
              </span>
            }
            trailing={
              <div className="flex gap-0.5">
                <IconButton label={tc("moveUp")} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </IconButton>
                <IconButton label={tc("moveDown")} disabled={i === visible.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </IconButton>
                <IconButton label={t("renameDepartment")} onClick={() => setEditing({ kind: "department", department: d })}>
                  <Pencil />
                </IconButton>
                <IconButton
                  label={d.archived_at ? tc("restore") : tc("archive")}
                  onClick={() => actions.archiveDepartment.mutate({ id: d.id, archived: Boolean(d.archived_at) })}
                >
                  {d.archived_at ? <ArchiveRestore /> : <Archive />}
                </IconButton>
              </div>
            }
          >
            <PositionList
              department={d}
              showArchived={showArchived}
              actions={actions}
              onEdit={(position) => setEditing({ kind: "position", department: d, position })}
            />
          </Section>
        ))
      )}

      {editing?.kind === "department" && (
        <DepartmentDialog
          department={editing.department}
          nextSort={all.length}
          actions={actions}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "position" && (
        <PositionDialog
          department={editing.department}
          position={editing.position}
          actions={actions}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function PositionList({
  department,
  showArchived,
  actions,
  onEdit,
}: {
  department: Department;
  showArchived: boolean;
  actions: Actions;
  onEdit: (p: Position | null) => void;
}) {
  const t = useTranslations("org");
  const tc = useTranslations("common");
  const positions = department.positions
    .filter((p) => showArchived || !p.archived_at)
    .sort((a, b) => a.level - b.level);

  return (
    <div>
      {positions.length === 0 && <p className="text-muted-foreground py-2 text-sm">{t("noPositions")}</p>}
      {positions.map((p) => (
        <div key={p.id} className="flex items-center gap-3 border-t py-1.5">
          <Pill tone="neutral" className="w-18 justify-center">
            {t("levelN", { level: p.level })}
          </Pill>
          <span className={cn("flex-1 font-semibold", p.archived_at && "text-muted-foreground")}>{p.name}</span>
          {p.archived_at && <Pill tone="neutral">{t("archived")}</Pill>}
          <IconButton label={tc("edit")} onClick={() => onEdit(p)}>
            <Pencil />
          </IconButton>
          <IconButton
            label={p.archived_at ? tc("restore") : tc("archive")}
            onClick={() => actions.archivePosition.mutate({ id: p.id, archived: Boolean(p.archived_at) })}
          >
            {p.archived_at ? <ArchiveRestore /> : <Archive />}
          </IconButton>
        </div>
      ))}
      {!department.archived_at && (
        <Button variant="ghost" className="text-primary mt-1 -ml-2 font-bold" onClick={() => onEdit(null)}>
          <Plus /> {t("addPosition")}
        </Button>
      )}
    </div>
  );
}

function DepartmentDialog({
  department,
  nextSort,
  actions,
  onClose,
}: {
  department: Department | null;
  nextSort: number;
  actions: Actions;
  onClose: () => void;
}) {
  const t = useTranslations("org");
  const tc = useTranslations("common");
  const schema = z.object({ name: z.string().trim().min(1) });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: department?.name ?? "" },
  });
  const submit = form.handleSubmit(async (v) => {
    await actions.saveDepartment.mutateAsync({ id: department?.id, name: v.name, sort_order: nextSort });
    onClose();
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{department ? t("renameDepartment") : t("newDepartment")}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="name" label={t("departmentName")} placeholder={t("departmentPlaceholder")} autoFocus />
          <DialogActions busy={actions.saveDepartment.isPending} onCancel={onClose} save={tc("save")} cancel={tc("cancel")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PositionDialog({
  department,
  position,
  actions,
  onClose,
}: {
  department: Department;
  position: Position | null;
  actions: Actions;
  onClose: () => void;
}) {
  const t = useTranslations("org");
  const tc = useTranslations("common");
  const nextLevel = Math.max(0, ...department.positions.filter((p) => !p.archived_at).map((p) => p.level)) + 1;
  const schema = z.object({
    name: z.string().trim().min(1),
    level: z.coerce.number<string>().int().min(1).max(20),
  });
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: position?.name ?? "", level: String(position?.level ?? nextLevel) },
  });
  const submit = form.handleSubmit(async (v) => {
    await actions.savePosition.mutateAsync({ id: position?.id, department_id: department.id, ...v });
    onClose();
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{position ? t("editPosition") : t("newPosition", { department: department.name })}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="name" label={t("positionName")} placeholder={t("positionPlaceholder")} autoFocus />
          <FormInput control={form.control} name="level" label={t("level")} type="number" min={1} />
          <FieldDescription>{t("levelHint")}</FieldDescription>
          <DialogActions busy={actions.savePosition.isPending} onCancel={onClose} save={tc("save")} cancel={tc("cancel")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
