"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DataTable, type AdminColumn } from "@/components/admin/data-table";
import { DialogActions } from "@/components/admin/dialog-actions";
import { FormInput } from "@/components/admin/form-fields";
import { EmptyState, PageHeader, Section } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/errors";
import { fmtDate } from "@/lib/format";
import { useRequiredSession } from "@/lib/session";

import { useCreateModule, useModules, type ModuleRow } from "./api";
import { VersionStatus } from "./status";

/** Drafts, the review queue and published modules (PRD T1, T4, T5). */
export function ModulesList() {
  const t = useTranslations("modules");
  const tn = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const session = useRequiredSession();
  const modules = useModules();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const canAuthor = session.hasGroup("module.author");
  const canReview = session.hasGroup("module.review");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (modules.data ?? []).filter(
      (m) => !m.archived_at && (!q || `${m.latest?.title} ${m.category}`.toLowerCase().includes(q)),
    );
  }, [modules.data, query]);
  const inReview = list.filter((m) => m.latest?.status === "in_review");

  const columns = useMemo<AdminColumn<ModuleRow>[]>(
    () => [
      { id: "title", header: t("colModule"), accessorFn: (m) => m.latest?.title ?? "", cell: ({ getValue }) => <span className="font-bold">{getValue() as string}</span> },
      { id: "category", header: t("colCategory"), accessorFn: (m) => m.category },
      { id: "version", header: t("colVersion"), enableSorting: false, cell: ({ row }) => `v${row.original.latest?.version ?? 1}` },
      {
        id: "status",
        header: t("colStatus"),
        accessorFn: (m) => m.latest?.status ?? "",
        cell: ({ row }) => (row.original.latest ? <VersionStatus status={row.original.latest.status} /> : null),
      },
      {
        id: "updated",
        header: t("colUpdated"),
        accessorFn: (m) => m.latest?.updated_at ?? "",
        cell: ({ row }) => <span className="text-muted-foreground">{fmtDate(row.original.latest?.updated_at, locale)}</span>,
      },
    ],
    [t, locale],
  );

  return (
    <>
      <PageHeader
        breadcrumb={tn("asuh")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <div className="relative w-60">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-11 bg-white pl-9" />
            </div>
            {canAuthor && (
              <Button className="h-11 px-4 font-bold" onClick={() => setCreating(true)}>
                <Plus /> {t("new")}
              </Button>
            )}
          </>
        }
      />

      {canReview && inReview.length > 0 && (
        <Section title={t("reviewQueue")}>
          <div className="divide-y">
            {inReview.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => router.push(`/modules/${m.id}`)}
                className="hover:bg-muted flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{m.latest?.title}</p>
                  <p className="text-muted-foreground text-[13px]">
                    {m.category} · v{m.latest?.version}
                    {m.latest?.author_id === session.profile.id && ` · ${t("ownModule")}`}
                  </p>
                </div>
                <ChevronRight className="text-muted-foreground size-5" />
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section>
        {modules.isPending ? (
          <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />
        ) : modules.isError ? (
          <EmptyState>{friendlyError(modules.error)}</EmptyState>
        ) : (
          <DataTable columns={columns} data={list} empty={t("empty")} onRowClick={(m) => router.push(`/modules/${m.id}`)} />
        )}
      </Section>

      {creating && <NewModuleDialog onClose={() => setCreating(false)} onCreated={(id) => router.push(`/modules/${id}`)} />}
    </>
  );
}

function NewModuleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("modules");
  const tc = useTranslations("common");
  const create = useCreateModule();
  const schema = z.object({ title: z.string().trim().min(1), category: z.string().trim().min(1) });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { title: "", category: "" } });
  const submit = form.handleSubmit(async (v) => {
    const id = await create.mutateAsync(v);
    onClose();
    onCreated(id);
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("new")}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="title" label={t("moduleTitle")} placeholder={t("titlePlaceholder")} autoFocus />
          <FormInput control={form.control} name="category" label={t("category")} placeholder={t("categoryPlaceholder")} />
          <DialogActions busy={create.isPending} onCancel={onClose} save={tc("create")} cancel={tc("cancel")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
