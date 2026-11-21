"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, Loader2, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable, type AdminColumn } from "@/components/admin/data-table";
import { EmptyState, PageHeader, Section } from "@/components/admin/page";
import { useSupabase } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { friendlyError, unwrap } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Rating = { rating_id: string; rater_id: string; rater_name: string; score: number; comment: string; created_at: string };

/**
 * Who rated a mentor (PRD M7, R5). Only mentor_rating.view_raters may call
 * mentor_ratings_with_raters(); asah-be logs every call, so raters are only
 * fetched when the viewer asks, never on page load.
 */
export function RatingsPage() {
  const t = useTranslations("ratings");
  const tn = useTranslations("nav");
  const locale = useLocale();
  const supabase = useSupabase();
  const [mentorId, setMentorId] = useState<string | null>(null);

  const mentors = useQuery({
    queryKey: ["mentors"],
    queryFn: async () => {
      const rows = unwrap(
        await supabase.from("mentorships").select("mentor_id, mentor:profiles!mentorships_mentor_id_fkey(full_name)"),
      );
      const byId = new Map<string, { id: string; name: string; trainees: number }>();
      for (const r of rows) {
        const m = byId.get(r.mentor_id) ?? { id: r.mentor_id, name: r.mentor?.full_name ?? "", trainees: 0 };
        m.trainees++;
        byId.set(r.mentor_id, m);
      }
      return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const reveal = useMutation({
    mutationFn: async (id: string): Promise<Rating[]> =>
      unwrap(await supabase.rpc("mentor_ratings_with_raters", { p_mentor: id })) as Rating[],
    onError: (e) => toast.error(friendlyError(e)),
  });

  const columns = useMemo<AdminColumn<Rating>[]>(
    () => [
      {
        id: "score",
        header: t("colScore"),
        accessorFn: (r) => r.score,
        cell: ({ row }) => (
          <span className="flex items-center gap-1 font-bold" aria-label={`${row.original.score} / 5`}>
            <Star className="fill-brand-amber text-brand-amber size-4" /> {row.original.score}
          </span>
        ),
      },
      { id: "rater", header: t("colRater"), accessorFn: (r) => r.rater_name },
      { id: "comment", header: t("colComment"), enableSorting: false, cell: ({ row }) => row.original.comment || "–" },
      { id: "date", header: t("colDate"), accessorFn: (r) => r.created_at, cell: ({ row }) => fmtDate(row.original.created_at, locale) },
    ],
    [t, locale],
  );

  const ratings = reveal.data;
  const avg = ratings?.length ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : null;
  const mentor = mentors.data?.find((m) => m.id === mentorId);

  return (
    <>
      <PageHeader breadcrumb={tn("asuh")} title={t("title")} subtitle={t("subtitle")} />
      <div className="bg-warning-soft text-warning mb-5 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold">
        <Eye className="mt-0.5 size-4 shrink-0" /> {t("warning")}
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <Section title={t("mentors")} className="w-full sm:w-72">
          {mentors.isPending ? (
            <Loader2 className="text-primary size-5 animate-spin" />
          ) : mentors.isError ? (
            <EmptyState>{friendlyError(mentors.error)}</EmptyState>
          ) : mentors.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noMentors")}</p>
          ) : (
            <div className="-mx-2 space-y-0.5">
              {mentors.data.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-current={m.id === mentorId}
                  onClick={() => {
                    setMentorId(m.id);
                    reveal.reset();
                  }}
                  className={cn("w-full rounded-[10px] px-3 py-2 text-left", m.id === mentorId ? "bg-secondary text-primary" : "hover:bg-muted")}
                >
                  <span className="block font-bold">{m.name}</span>
                  <span className="text-muted-foreground text-[13px]">{t("trainees", { count: m.trainees })}</span>
                </button>
              ))}
            </div>
          )}
        </Section>
        <div className="min-w-0 flex-[1_1_480px]">
          {!mentor ? (
            <EmptyState>{t("pick")}</EmptyState>
          ) : !ratings ? (
            <Section title={mentor.name}>
              <Button className="h-10 font-bold" disabled={reveal.isPending} onClick={() => reveal.mutate(mentor.id)}>
                {reveal.isPending ? <Loader2 className="animate-spin" /> : <Eye />}
                {t("show")}
              </Button>
            </Section>
          ) : (
            <Section title={mentor.name} trailing={avg != null && <span className="text-sm font-bold">{t("average", { avg: avg.toFixed(1), count: ratings.length })}</span>}>
              <DataTable columns={columns} data={ratings} empty={t("none")} />
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
