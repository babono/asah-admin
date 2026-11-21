"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldDescription } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { usePositions } from "@/features/org/api";
import { friendlyError } from "@/lib/errors";
import { fmtDate } from "@/lib/format";
import { useRequiredSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { useModuleActions, useModule, useModules, type DetailsValues, type ModuleActions, type ModuleDetail } from "../api";
import { VersionStatus } from "../status";
import { BlocksEditor } from "./blocks-editor";
import { QuizEditor } from "./quiz-editor";
import { RubricEditor } from "./rubric-editor";

/**
 * Module builder: details, target positions, content blocks, quiz, practical
 * rubric, review and versions (PRD T1-T5; design screen 8).
 */
export function ModuleBuilder() {
  const { id } = useParams<{ id: string }>();
  const query = useModule(id);
  if (query.isPending) return <Loader2 className="text-primary mx-auto my-16 size-7 animate-spin" />;
  if (query.isError) return <EmptyState>{friendlyError(query.error)}</EmptyState>;
  return <Builder key={query.data.version.id} d={query.data} />;
}

const optionalInt = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) > 0));

const detailsSchema = z.object({
  title: z.string().trim().min(1),
  category: z.string().trim().min(1),
  summary: z.string().trim(),
  estimated_minutes: optionalInt,
  certificate_valid_days: optionalInt,
  prerequisite_module_id: z.string().nullable(),
  requires_retraining: z.boolean(),
});
type DetailsForm = z.infer<typeof detailsSchema>;

const toDetails = (v: DetailsForm): DetailsValues => ({
  title: v.title,
  category: v.category,
  summary: v.summary || null,
  estimated_minutes: v.estimated_minutes ? Number(v.estimated_minutes) : null,
  certificate_valid_days: v.certificate_valid_days ? Number(v.certificate_valid_days) : null,
  prerequisite_module_id: v.prerequisite_module_id,
  requires_retraining: v.requires_retraining,
});

function Builder({ d }: { d: ModuleDetail }) {
  const t = useTranslations("modules.builder");
  const ts = useTranslations("modules.status");
  const tc = useTranslations("common");
  const session = useRequiredSession();
  const me = session.profile.id;
  const canAuthor = session.hasGroup("module.author");
  const canReview = session.hasGroup("module.review");
  const editable = d.editable && canAuthor;
  const v = d.version;
  const published = d.versions.find((x) => x.status === "published");

  const actions = useModuleActions(d, {
    saved: tc("saved"),
    submitted: t("submitted"),
    published: t("published"),
    sentBack: t("sentBack"),
    newVersion: t("newVersionDone"),
  });

  const form = useForm<DetailsForm>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      title: v.title,
      category: d.module.category,
      summary: v.summary ?? "",
      estimated_minutes: v.estimated_minutes?.toString() ?? "",
      certificate_valid_days: v.certificate_valid_days?.toString() ?? "",
      prerequisite_module_id: v.prerequisite_module_id,
      requires_retraining: v.requires_retraining,
    },
  });

  const [reviewing, setReviewing] = useState<"approve" | "changes" | null>(null);

  return (
    <>
      <PageHeader
        breadcrumb={
          <>
            <Link href="/modules" className="text-primary">
              {t("breadcrumb")}
            </Link>{" "}
            / {v.title}
          </>
        }
        title={`${v.title} · v${v.version}`}
        subtitle={published && published.id !== v.id ? t("staffOn", { version: published.version }) : undefined}
        actions={
          <>
            <VersionStatus status={v.status} />
            {editable && (
              <>
                <Button
                  variant="outline"
                  className="h-11 px-4"
                  disabled={actions.saveDetails.isPending}
                  onClick={form.handleSubmit((x) => actions.saveDetails.mutate(toDetails(x)))}
                >
                  {t("saveDetails")}
                </Button>
                <Button
                  className="h-11 px-4 font-bold"
                  disabled={actions.submitForReview.isPending}
                  onClick={form.handleSubmit((x) => actions.submitForReview.mutate(toDetails(x)))}
                >
                  {actions.submitForReview.isPending && <Loader2 className="animate-spin" />}
                  {t("submit")}
                </Button>
              </>
            )}
            {v.status === "in_review" && canReview && v.author_id !== me && (
              <>
                <Button variant="outline" className="h-11 px-4" onClick={() => setReviewing("changes")}>
                  {t("requestChanges")}
                </Button>
                <Button className="h-11 px-4 font-bold" onClick={() => setReviewing("approve")}>
                  {t("approve")}
                </Button>
              </>
            )}
            {v.status === "in_review" && (!canReview || v.author_id === me) && <Pill tone="info">{t("waitingReview")}</Pill>}
            {(v.status === "published" || v.status === "retired") && canAuthor && (
              <Button className="h-11 px-4 font-bold" disabled={actions.newVersion.isPending} onClick={() => actions.newVersion.mutate()}>
                <Copy /> {t("newVersion")}
              </Button>
            )}
          </>
        }
      />

      {v.status === "changes_requested" && v.review_comment && (
        <div className="bg-danger-soft text-destructive mb-5 rounded-xl px-4 py-3 text-sm font-semibold">
          {t("changesRequested", { comment: v.review_comment })}
        </div>
      )}
      {!d.editable && (
        <div className="bg-info-soft text-info mb-5 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold">
          <Lock className="size-4" />
          {v.status === "published" || v.status === "retired" ? t("lockedPublished") : t("locked", { status: ts(v.status).toLowerCase() })}
        </div>
      )}

      <Section title={t("details")}>
        <fieldset disabled={!editable} className={cn(!editable && "opacity-80")}>
          <DetailsFields control={form.control} moduleId={d.module.id} showRetraining={v.version > 1} />
        </fieldset>
      </Section>
      <Section title={t("positions")}>
        <Targets d={d} actions={actions} enabled={canAuthor} />
      </Section>
      <Section title={t("content")}>
        <BlocksEditor d={d} actions={actions} editable={editable} />
      </Section>
      <Section title={t("quiz")}>
        <QuizEditor d={d} actions={actions} editable={editable} />
      </Section>
      <Section title={t("practical")}>
        <RubricEditor d={d} actions={actions} editable={editable} />
      </Section>
      <Versions d={d} />

      {reviewing === "changes" && <RequestChangesDialog actions={actions} onClose={() => setReviewing(null)} />}
      {reviewing === "approve" && (
        <AlertDialog open onOpenChange={(o) => !o && setReviewing(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("publishTitle", { title: v.title })}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("publishBody")} {v.requires_retraining && t("publishRetraining")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  actions.review.mutate({ approve: true, comment: null }, { onSuccess: () => toast.success(t("published")) })
                }
              >
                {tc("publish")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function DetailsFields({ control, moduleId, showRetraining }: { control: Control<DetailsForm>; moduleId: string; showRetraining: boolean }) {
  const t = useTranslations("modules");
  const tb = useTranslations("modules.builder");
  const modules = useModules();
  const others = (modules.data ?? []).filter((m) => m.id !== moduleId && !m.archived_at);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FormInput control={control} name="title" label={t("moduleTitle")} />
      <FormInput control={control} name="category" label={t("category")} />
      <FormTextarea control={control} name="summary" label={tb("summary")} className="md:col-span-2" rows={2} />
      <FormSelect
        control={control}
        name="prerequisite_module_id"
        label={tb("prerequisite")}
        options={[{ value: null, label: tb("none") }, ...others.map((m) => ({ value: m.id, label: m.latest?.title ?? "–" }))]}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormInput control={control} name="estimated_minutes" label={tb("minutes")} inputMode="numeric" />
        <FormInput control={control} name="certificate_valid_days" label={tb("certDays")} inputMode="numeric" description={tb("certHint")} />
      </div>
      {showRetraining && (
        <div className="md:col-span-2">
          <FormCheckbox control={control} name="requires_retraining" label={tb("retraining")} />
          <FieldDescription className="mt-1 ml-6">{tb("retrainingHint")}</FieldDescription>
        </div>
      )}
    </div>
  );
}

function Targets({ d, actions, enabled }: { d: ModuleDetail; actions: ModuleActions; enabled: boolean }) {
  const t = useTranslations("modules.builder");
  const positions = usePositions();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(positions.data ?? []).map((p) => {
          const on = d.targets.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              disabled={!enabled || actions.toggleTarget.isPending}
              onClick={() => actions.toggleTarget.mutate({ positionId: p.id, on: !on })}
              className={cn(
                "rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-bold disabled:cursor-default",
                on ? "border-primary bg-secondary text-primary" : "text-text-strong border-dashed border-[#a9aea9]",
              )}
            >
              {on ? p.name : `+ ${p.name}`}
            </button>
          );
        })}
      </div>
      <FieldDescription>{t("positionsHint")}</FieldDescription>
    </div>
  );
}

function Versions({ d }: { d: ModuleDetail }) {
  const t = useTranslations("modules.builder");
  const locale = useLocale();
  return (
    <Section title={t("versions")}>
      <div className="divide-y">
        {d.versions.map((x) => (
          <div key={x.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                v{x.version} · {x.title}
              </p>
              <p className="text-muted-foreground text-[13px]">
                {[
                  x.published_at && t("publishedOn", { date: fmtDate(x.published_at, locale) }),
                  x.requires_retraining && t("retraining"),
                  x.review_comment && `“${x.review_comment}”`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <VersionStatus status={x.status} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function RequestChangesDialog({ actions, onClose }: { actions: ModuleActions; onClose: () => void }) {
  const t = useTranslations("modules.builder");
  const tc = useTranslations("common");
  const [comment, setComment] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("changesTitle")}</DialogTitle>
        </DialogHeader>
        <Textarea autoFocus rows={4} value={comment} onChange={(e) => setComment(e.target.value)} aria-label={t("comment")} />
        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            className="h-10 font-bold"
            disabled={!comment.trim() || actions.review.isPending}
            onClick={() =>
              actions.review.mutate(
                { approve: false, comment: comment.trim() },
                {
                  onSuccess: () => {
                    toast.success(t("sentBack"));
                    onClose();
                  },
                },
              )
            }
          >
            {t("requestChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
