"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DialogActions } from "@/components/admin/dialog-actions";
import { FormInput, FormTextarea } from "@/components/admin/form-fields";
import { IconButton } from "@/components/admin/icon-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { Criterion, ModuleActions, ModuleDetail } from "../api";

/** Practical test rubric; the trainee records in the app, the mentor scores each line (PRD T3). */
export function RubricEditor({ d, actions, editable }: { d: ModuleDetail; actions: ModuleActions; editable: boolean }) {
  const t = useTranslations("modules.builder");
  const tc = useTranslations("common");
  const [editing, setEditing] = useState<Criterion | "new" | null>(null);

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        {d.rubric.length === 0 ? t("noRubric") : t("rubricSummary", { count: d.rubric.length })}
      </p>
      <div className="divide-y">
        {d.rubric.map((r) => (
          <div key={r.id} className="flex items-start gap-3 py-2.5">
            <CircleCheck className="text-primary mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{r.title}</p>
              {r.description && <p className="text-muted-foreground text-[13px]">{r.description}</p>}
            </div>
            {editable && (
              <>
                <IconButton label={tc("edit")} onClick={() => setEditing(r)}>
                  <Pencil />
                </IconButton>
                <IconButton label={tc("delete")} danger onClick={() => actions.deleteCriterion.mutate(r.id)}>
                  <Trash2 />
                </IconButton>
              </>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <Button variant="outline" className="h-10" onClick={() => setEditing("new")}>
          <Plus /> {t("addCriterion")}
        </Button>
      )}
      {editing && <CriterionDialog criterion={editing === "new" ? null : editing} actions={actions} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CriterionDialog({ criterion, actions, onClose }: { criterion: Criterion | null; actions: ModuleActions; onClose: () => void }) {
  const t = useTranslations("modules.builder");
  const tc = useTranslations("common");
  const schema = z.object({ title: z.string().trim().min(1), description: z.string().trim() });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { title: criterion?.title ?? "", description: criterion?.description ?? "" },
  });
  const submit = form.handleSubmit(async (v) => {
    await actions.saveCriterion.mutateAsync({ id: criterion?.id, title: v.title, description: v.description || null });
    onClose();
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{criterion ? t("editCriterion") : t("addCriterion")}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="title" label={t("criterion")} placeholder={t("criterionPlaceholder")} autoFocus />
          <FormTextarea control={form.control} name="description" label={t("criterionHow")} rows={2} />
          <DialogActions busy={actions.saveCriterion.isPending} onCancel={onClose} save={tc("save")} cancel={tc("cancel")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
