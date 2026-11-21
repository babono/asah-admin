"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSupabase } from "@/components/providers";
import type { Enums } from "@/lib/database.types";
import { friendlyError, unwrap } from "@/lib/errors";
import { useRequiredSession } from "@/lib/session";

/**
 * Learning modules (PRD T1-T5). A module is a stable identity; its content
 * lives in numbered versions: draft -> in_review -> published (one at a
 * time) -> retired. Authors need module.author, reviewers module.review;
 * the review RPC refuses an author approving their own module (R7).
 */
export const moduleKeys = {
  all: ["modules"] as const,
  one: (id: string) => ["modules", id] as const,
};

export function useModules() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: moduleKeys.all,
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from("modules")
          // module_versions has two FKs to modules (module_id, prerequisite_module_id)
          .select("id, category, archived_at, created_at, module_versions!module_versions_module_id_fkey(id, version, status, title, author_id, updated_at)")
          .order("created_at", { ascending: false }),
      );
      return rows.map((m) => {
        const versions = [...m.module_versions].sort((a, b) => b.version - a.version);
        return {
          ...m,
          latest: versions[0] ?? null,
          published: versions.find((v) => v.status === "published") ?? null,
        };
      });
    },
  });
}
export type ModuleRow = NonNullable<ReturnType<typeof useModules>["data"]>[number];

// ---------------------------------------------------------------- one module

export function useModule(id: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: moduleKeys.one(id),
    queryFn: async () => {
      const mod = unwrap(await supabase.from("modules").select("id, category, archived_at, created_by").eq("id", id).single());
      const versions = unwrap(
        await supabase.from("module_versions").select("*").eq("module_id", id).order("version", { ascending: false }),
      );
      const v = versions[0];
      const [targets, blocks, quiz, rubric] = await Promise.all([
        supabase.from("module_target_positions").select("position_id").eq("module_id", id),
        supabase
          .from("content_blocks")
          .select("id, sort, type, title, body, media_file_id, media_files(status, duration_seconds, mime_type)")
          .eq("module_version_id", v.id)
          .order("sort"),
        supabase.from("quizzes").select("*").eq("module_version_id", v.id).maybeSingle(),
        supabase.from("rubric_criteria").select("*").eq("module_version_id", v.id).order("sort"),
      ]);
      const quizRow = unwrap(quiz);
      const questions = quizRow
        ? unwrap(
            await supabase
              .from("quiz_questions")
              .select("sort, questions(id, prompt, topic, question_options(id, label, is_correct, sort))")
              .eq("quiz_id", quizRow.id)
              .order("sort"),
          )
            .map((r) => r.questions)
            .filter((q): q is NonNullable<typeof q> => Boolean(q))
            .map((q) => ({ ...q, question_options: [...q.question_options].sort((a, b) => a.sort - b.sort) }))
        : [];
      return {
        module: mod,
        versions,
        version: v,
        editable: v.status === "draft" || v.status === "changes_requested",
        targets: new Set(unwrap(targets).map((t) => t.position_id)),
        blocks: unwrap(blocks),
        quiz: quizRow,
        questions,
        rubric: unwrap(rubric),
      };
    },
  });
}
export type ModuleDetail = NonNullable<ReturnType<typeof useModule>["data"]>;
export type Block = ModuleDetail["blocks"][number];
export type Question = ModuleDetail["questions"][number];
export type Criterion = ModuleDetail["rubric"][number];

export function useQuestionBank(enabled: boolean) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["questions"],
    enabled,
    queryFn: async () =>
      unwrap(await supabase.from("questions").select("id, prompt, topic").is("archived_at", null).order("topic").order("prompt")),
  });
}

function useModuleMutation<V, R = unknown>(moduleId: string | null, fn: (v: V) => Promise<R>, success?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (success) toast.success(success);
      void qc.invalidateQueries({ queryKey: moduleKeys.all, exact: true });
      if (moduleId) void qc.invalidateQueries({ queryKey: moduleKeys.one(moduleId) });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
}

export function useCreateModule() {
  const supabase = useSupabase();
  const me = useRequiredSession().profile.id;
  return useModuleMutation(null, async (v: { title: string; category: string }) => {
    const m = unwrap(await supabase.from("modules").insert({ category: v.category, created_by: me }).select("id").single());
    unwrap(
      await supabase.from("module_versions").insert({ module_id: m.id, version: 1, status: "draft", title: v.title, author_id: me }),
    );
    return m.id;
  });
}

export type DetailsValues = {
  title: string;
  category: string;
  summary: string | null;
  estimated_minutes: number | null;
  certificate_valid_days: number | null;
  prerequisite_module_id: string | null;
  requires_retraining: boolean;
};

export function useModuleActions(d: ModuleDetail, msgs: Record<"saved" | "submitted" | "published" | "sentBack" | "newVersion", string>) {
  const supabase = useSupabase();
  const me = useRequiredSession().profile.id;
  const id = d.module.id;
  const versionId = d.version.id;

  const saveDetailsFn = async (v: DetailsValues) => {
    const { category, ...version } = v;
    unwrap(await supabase.from("modules").update({ category }).eq("id", id));
    unwrap(await supabase.from("module_versions").update(version).eq("id", versionId));
  };
  const saveDetails = useModuleMutation(id, saveDetailsFn, msgs.saved);

  const submitForReview = useModuleMutation(
    id,
    async (details: DetailsValues) => {
      await saveDetailsFn(details);
      unwrap(await supabase.rpc("submit_module_for_review", { p_version: versionId }));
    },
    msgs.submitted,
  );

  /** Approving publishes it, moves open assignments to it, and reassigns if retraining is needed. */
  const review = useModuleMutation(id, async (v: { approve: boolean; comment: string | null }) =>
    unwrap(await supabase.rpc("review_module_version", { p_version: versionId, p_approve: v.approve, p_comment: v.comment ?? undefined })),
  );

  const toggleTarget = useModuleMutation(id, async (v: { positionId: string; on: boolean }) =>
    v.on
      ? unwrap(await supabase.from("module_target_positions").insert({ module_id: id, position_id: v.positionId }))
      : unwrap(await supabase.from("module_target_positions").delete().eq("module_id", id).eq("position_id", v.positionId)),
  );

  /** Copies the latest version (blocks, quiz, questions, rubric) into a new draft (T5). */
  const newVersion = useModuleMutation(
    id,
    async () => {
      const src = d.version;
      const nv = unwrap(
        await supabase
          .from("module_versions")
          .insert({
            module_id: id,
            version: src.version + 1,
            status: "draft",
            title: src.title,
            summary: src.summary,
            prerequisite_module_id: src.prerequisite_module_id,
            estimated_minutes: src.estimated_minutes,
            certificate_valid_days: src.certificate_valid_days,
            author_id: me,
          })
          .select("id")
          .single(),
      ).id;
      if (d.blocks.length) {
        unwrap(
          await supabase.from("content_blocks").insert(
            d.blocks.map((b) => ({ module_version_id: nv, sort: b.sort, type: b.type, title: b.title, body: b.body, media_file_id: b.media_file_id })),
          ),
        );
      }
      if (d.rubric.length) {
        unwrap(
          await supabase
            .from("rubric_criteria")
            .insert(d.rubric.map((r) => ({ module_version_id: nv, title: r.title, description: r.description, sort: r.sort }))),
        );
      }
      if (d.quiz) {
        const { id: _id, module_version_id: _v, ...settings } = d.quiz;
        const q = unwrap(await supabase.from("quizzes").insert({ ...settings, module_version_id: nv }).select("id").single());
        if (d.questions.length) {
          unwrap(await supabase.from("quiz_questions").insert(d.questions.map((x, i) => ({ quiz_id: q.id, question_id: x.id, sort: i }))));
        }
      }
    },
    msgs.newVersion,
  );

  // ---- content blocks (editable versions only; RLS enforces it too)
  const nextSort = () => Math.max(0, ...d.blocks.map((b) => b.sort)) + 1;

  const addBlock = useModuleMutation(id, async (v: { type: Enums<"content_block_type">; title: string | null; body?: string | null; media_file_id?: string | null }) =>
    unwrap(await supabase.from("content_blocks").insert({ module_version_id: versionId, sort: nextSort(), ...v })),
  );
  const updateBlock = useModuleMutation(id, async (v: { id: string; title: string | null; body?: string | null; media_file_id?: string | null }) => {
    const { id: blockId, ...patch } = v;
    return unwrap(await supabase.from("content_blocks").update(patch).eq("id", blockId));
  });
  /** (version, sort) is unique: park one block while swapping. */
  const moveBlock = useModuleMutation(id, async (v: { a: Block; b: Block }) => {
    unwrap(await supabase.from("content_blocks").update({ sort: -1 }).eq("id", v.a.id));
    unwrap(await supabase.from("content_blocks").update({ sort: v.a.sort }).eq("id", v.b.id));
    unwrap(await supabase.from("content_blocks").update({ sort: v.b.sort }).eq("id", v.a.id));
  });
  const deleteBlock = useModuleMutation(id, async (blockId: string) =>
    unwrap(await supabase.from("content_blocks").delete().eq("id", blockId)),
  );

  // ---- quiz
  const createQuiz = useModuleMutation(id, async () => unwrap(await supabase.from("quizzes").insert({ module_version_id: versionId })));
  const updateQuiz = useModuleMutation(
    id,
    async (v: { pass_mark_pct: number; max_attempts: number | null; question_count: number | null; time_limit_seconds: number | null; randomize: boolean }) =>
      unwrap(await supabase.from("quizzes").update(v).eq("id", d.quiz!.id)),
    msgs.saved,
  );
  /**
   * Questions live in a shared bank. Options are updated in place, so quiz
   * attempts that point at them stay valid.
   */
  const saveQuestion = useModuleMutation(
    id,
    async (v: { id?: string; prompt: string; options: { id?: string; label: string; is_correct: boolean }[] }) => {
      let qid = v.id;
      if (qid) {
        unwrap(await supabase.from("questions").update({ prompt: v.prompt }).eq("id", qid));
      } else {
        qid = unwrap(
          await supabase.from("questions").insert({ prompt: v.prompt, topic: d.module.category, created_by: me }).select("id").single(),
        ).id;
        unwrap(await supabase.from("quiz_questions").insert({ quiz_id: d.quiz!.id, question_id: qid, sort: d.questions.length }));
      }
      const existing = d.questions.find((q) => q.id === qid)?.question_options ?? [];
      const keep = new Set(v.options.map((o) => o.id).filter(Boolean));
      for (const old of existing) {
        if (!keep.has(old.id)) unwrap(await supabase.from("question_options").delete().eq("id", old.id));
      }
      for (const [i, o] of v.options.entries()) {
        if (o.id) {
          unwrap(await supabase.from("question_options").update({ label: o.label, is_correct: o.is_correct, sort: i }).eq("id", o.id));
        } else {
          unwrap(await supabase.from("question_options").insert({ question_id: qid, label: o.label, is_correct: o.is_correct, sort: i }));
        }
      }
    },
    msgs.saved,
  );
  const removeQuestion = useModuleMutation(id, async (questionId: string) =>
    unwrap(await supabase.from("quiz_questions").delete().eq("quiz_id", d.quiz!.id).eq("question_id", questionId)),
  );
  const addFromBank = useModuleMutation(id, async (ids: string[]) =>
    unwrap(
      await supabase
        .from("quiz_questions")
        .insert(ids.map((qid, i) => ({ quiz_id: d.quiz!.id, question_id: qid, sort: d.questions.length + i }))),
    ),
  );

  // ---- practical test rubric
  const saveCriterion = useModuleMutation(id, async (v: { id?: string; title: string; description: string | null }) =>
    v.id
      ? unwrap(await supabase.from("rubric_criteria").update({ title: v.title, description: v.description }).eq("id", v.id))
      : unwrap(
          await supabase
            .from("rubric_criteria")
            .insert({ module_version_id: versionId, title: v.title, description: v.description, sort: d.rubric.length }),
        ),
  );
  const deleteCriterion = useModuleMutation(id, async (criterionId: string) =>
    unwrap(await supabase.from("rubric_criteria").delete().eq("id", criterionId)),
  );

  return {
    saveDetails, submitForReview, review, toggleTarget, newVersion,
    addBlock, updateBlock, moveBlock, deleteBlock,
    createQuiz, updateQuiz, saveQuestion, removeQuestion, addFromBank,
    saveCriterion, deleteCriterion,
  };
}
export type ModuleActions = ReturnType<typeof useModuleActions>;
