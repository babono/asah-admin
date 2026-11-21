"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Library, Pencil, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DialogActions } from "@/components/admin/dialog-actions";
import { FormCheckbox, FormInput } from "@/components/admin/form-fields";
import { IconButton } from "@/components/admin/icon-button";
import { EmptyState } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useQuestionBank, type ModuleActions, type ModuleDetail, type Question } from "../api";

/** Multiple-choice quiz from the shared question bank, graded on the server (PRD T2). */
export function QuizEditor({ d, actions, editable }: { d: ModuleDetail; actions: ModuleActions; editable: boolean }) {
  const t = useTranslations("modules.builder");
  const tc = useTranslations("common");
  const [dialog, setDialog] = useState<"settings" | "bank" | Question | "new" | null>(null);

  if (!d.quiz) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">{t("noQuiz")}</p>
        {editable && (
          <Button variant="outline" className="h-10" disabled={actions.createQuiz.isPending} onClick={() => actions.createQuiz.mutate()}>
            <Plus /> {t("addQuiz")}
          </Button>
        )}
      </div>
    );
  }

  const q = d.quiz;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {t("quizSummary", {
            questions: d.questions.length,
            pass: q.pass_mark_pct,
            tries: q.max_attempts ? t("tries", { count: q.max_attempts }) : t("unlimitedTries"),
          })}
        </p>
        {editable && (
          <Button variant="ghost" onClick={() => setDialog("settings")}>
            {t("settings")}
          </Button>
        )}
      </div>

      {d.questions.length === 0 && <EmptyState>{t("noQuiz")}</EmptyState>}
      {d.questions.map((question) => (
        <div key={question.id} className="bg-background flex items-start gap-2 rounded-[10px] p-3">
          <div className="min-w-0 flex-1">
            <p className="font-bold">{question.prompt}</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {question.question_options.map((o) => (
                <li key={o.id} className={cn("flex items-center gap-2", o.is_correct ? "text-primary font-bold" : "text-muted-foreground")}>
                  {o.is_correct ? <Check className="size-3.5" /> : <span className="size-3.5" />}
                  {o.label}
                </li>
              ))}
            </ul>
          </div>
          {editable && (
            <>
              <IconButton label={tc("edit")} onClick={() => setDialog(question)}>
                <Pencil />
              </IconButton>
              <IconButton label={t("removeFromQuiz")} danger onClick={() => actions.removeQuestion.mutate(question.id)}>
                <Trash2 />
              </IconButton>
            </>
          )}
        </div>
      ))}

      {editable && (
        <div className="flex flex-wrap gap-2.5">
          <Button variant="outline" className="h-10" onClick={() => setDialog("new")}>
            <Plus /> {t("newQuestion")}
          </Button>
          <Button variant="outline" className="h-10" onClick={() => setDialog("bank")}>
            <Library /> {t("fromBank")}
          </Button>
        </div>
      )}

      {dialog === "settings" && <SettingsDialog d={d} actions={actions} onClose={() => setDialog(null)} />}
      {dialog === "bank" && <BankDialog d={d} actions={actions} onClose={() => setDialog(null)} />}
      {(dialog === "new" || (dialog && typeof dialog === "object")) && (
        <QuestionDialog question={dialog === "new" ? null : dialog} actions={actions} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

const optionalPositive = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) > 0));

function SettingsDialog({ d, actions, onClose }: { d: ModuleDetail; actions: ModuleActions; onClose: () => void }) {
  const t = useTranslations("modules.builder");
  const tc = useTranslations("common");
  const q = d.quiz!;
  const schema = z.object({
    pass_mark_pct: z.coerce.number<string>().int().min(0).max(100),
    max_attempts: optionalPositive,
    question_count: optionalPositive,
    time_limit_minutes: optionalPositive,
    randomize: z.boolean(),
  });
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      pass_mark_pct: String(q.pass_mark_pct),
      max_attempts: q.max_attempts?.toString() ?? "",
      question_count: q.question_count?.toString() ?? "",
      time_limit_minutes: q.time_limit_seconds ? String(Math.round(q.time_limit_seconds / 60)) : "",
      randomize: q.randomize,
    },
  });
  const n = (v: string) => (v === "" ? null : Number(v));
  const submit = form.handleSubmit(async (v) => {
    await actions.updateQuiz.mutateAsync({
      pass_mark_pct: v.pass_mark_pct,
      max_attempts: n(v.max_attempts),
      question_count: n(v.question_count),
      time_limit_seconds: v.time_limit_minutes === "" ? null : Number(v.time_limit_minutes) * 60,
      randomize: v.randomize,
    });
    onClose();
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("quizSettings")}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="pass_mark_pct" label={t("passMark")} type="number" min={0} max={100} />
          <FormInput control={form.control} name="max_attempts" label={t("maxAttempts")} inputMode="numeric" />
          <FormInput control={form.control} name="question_count" label={t("questionCount")} inputMode="numeric" />
          <FormInput control={form.control} name="time_limit_minutes" label={t("timeLimit")} inputMode="numeric" />
          <FormCheckbox control={form.control} name="randomize" label={t("randomize")} />
          <DialogActions busy={actions.updateQuiz.isPending} onCancel={onClose} save={tc("save")} cancel={tc("cancel")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

type OptionDraft = { id?: string; label: string };

function QuestionDialog({ question, actions, onClose }: { question: Question | null; actions: ModuleActions; onClose: () => void }) {
  const t = useTranslations("modules.builder");
  const tc = useTranslations("common");
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [options, setOptions] = useState<OptionDraft[]>(
    question ? question.question_options.map((o) => ({ id: o.id, label: o.label })) : [{ label: "" }, { label: "" }, { label: "" }],
  );
  const [correct, setCorrect] = useState(Math.max(0, question?.question_options.findIndex((o) => o.is_correct) ?? 0));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const filled = options.map((o, i) => ({ ...o, label: o.label.trim(), i })).filter((o) => o.label);
    if (filled.length < 2) return setError(t("needTwo"));
    if (!filled.some((o) => o.i === correct)) return setError(t("needCorrect"));
    await actions.saveQuestion.mutateAsync({
      id: question?.id,
      prompt: prompt.trim(),
      options: filled.map((o) => ({ id: o.id, label: o.label, is_correct: o.i === correct })),
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{question ? t("editQuestion") : t("newQuestion")}</DialogTitle>
          <DialogDescription>{t("answersHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="q-prompt">{t("question")}</Label>
            <Textarea id="q-prompt" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} autoFocus />
          </div>
          <fieldset className="space-y-2">
            <legend className="sr-only">{t("correct")}</legend>
            {options.map((o, i) => (
              <div key={o.id ?? `new-${i}`} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={correct === i}
                  onChange={() => setCorrect(i)}
                  aria-label={`${t("correct")}: ${t("answer", { n: i + 1 })}`}
                  className="accent-primary size-4"
                />
                <Input
                  value={o.label}
                  onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  placeholder={t("answer", { n: i + 1 })}
                  aria-label={t("answer", { n: i + 1 })}
                  className="h-10"
                />
                {options.length > 2 && (
                  <IconButton
                    label={tc("delete")}
                    onClick={() => {
                      setOptions(options.filter((_, j) => j !== i));
                      if (correct >= i && correct > 0) setCorrect(correct - 1);
                    }}
                  >
                    <X />
                  </IconButton>
                )}
              </div>
            ))}
          </fieldset>
          {options.length < 6 && (
            <Button variant="ghost" className="text-primary -ml-2" onClick={() => setOptions([...options, { label: "" }])}>
              <Plus /> {t("addAnswer")}
            </Button>
          )}
          {error && <p className="text-destructive text-sm font-semibold">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button className="h-10 font-bold" disabled={!prompt.trim() || actions.saveQuestion.isPending} onClick={save}>
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BankDialog({ d, actions, onClose }: { d: ModuleDetail; actions: ModuleActions; onClose: () => void }) {
  const t = useTranslations("modules.builder");
  const tc = useTranslations("common");
  const bank = useQuestionBank(true);
  const have = new Set(d.questions.map((q) => q.id));
  const available = (bank.data ?? []).filter((q) => !have.has(q.id));
  const [picked, setPicked] = useState<Set<string>>(new Set());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("bankTitle")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {available.length === 0 && !bank.isPending && <p className="text-muted-foreground text-sm">{t("bankEmpty")}</p>}
          {available.map((q) => (
            <label key={q.id} className="hover:bg-muted flex cursor-pointer items-start gap-3 rounded-lg p-2">
              <Checkbox
                className="mt-0.5"
                checked={picked.has(q.id)}
                onCheckedChange={(on) => {
                  const next = new Set(picked);
                  if (on === true) next.add(q.id);
                  else next.delete(q.id);
                  setPicked(next);
                }}
              />
              <span>
                <span className="block text-sm font-semibold">{q.prompt}</span>
                {q.topic && <span className="text-muted-foreground text-xs">{q.topic}</span>}
              </span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            className="h-10 font-bold"
            disabled={picked.size === 0 || actions.addFromBank.isPending}
            onClick={() => actions.addFromBank.mutate([...picked], { onSuccess: onClose })}
          >
            {t("addCount", { count: picked.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
