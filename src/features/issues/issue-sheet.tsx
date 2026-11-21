"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { MediaImage } from "@/components/admin/media-image";
import { Pill } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useRequiredSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { sourceName, useIssueActions, useIssueEvents, useOutletStaff, usePeople, useResponsePhotos, type IssueRow } from "./api";
import { IssueStatus } from "./issue-status";

const fmt = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** One issue: details, photos, timeline and the actions this person may take (S1, S2). */
export function IssueSheet({ issue, onClose }: { issue: IssueRow; onClose: () => void }) {
  const t = useTranslations("issues");
  const tc = useTranslations("common");
  const locale = useLocale();
  const session = useRequiredSession();
  const me = session.profile.id;
  const events = useIssueEvents(issue.id);
  const photos = useResponsePhotos(issue.response_id);
  const people = usePeople([issue.raised_by, issue.assigned_to, issue.fixed_by, ...(events.data ?? []).map((e) => e.actor_id)]);
  const name = (id: string | null) => (id ? (people.data?.get(id) ?? "…") : t("system"));
  const actions = useIssueActions({ assigned: t("assigned"), closed: t("closedMsg"), reopened: t("reopenedMsg"), commented: t("commented") });

  const canAssign = issue.status === "open" && session.can("issue.assign", issue.outlet_id);
  const canVerify = issue.status === "fixed" && session.can("issue.verify", issue.outlet_id);
  const ownFix = issue.fixed_by === me;
  const canComment = issue.status !== "closed" && (session.can("issue.view", issue.outlet_id) || issue.assigned_to === me);

  const staff = useOutletStaff(issue.outlet_id, canAssign);
  const [assignee, setAssignee] = useState<string | undefined>(issue.assigned_to ?? undefined);
  const [reopening, setReopening] = useState(false);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const late = issue.status === "open" && issue.due_at < new Date().toISOString();
  const raisedPhoto = events.data?.find((e) => e.type === "created" && e.media_file_id)?.media_file_id;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="pr-6 text-lg">{issue.title}</SheetTitle>
          <SheetDescription>
            {session.outlets.get(issue.outlet_id)?.name} · {issue.source === "manual" ? t("manual") : sourceName(issue)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <div className="flex flex-wrap gap-2">
            <IssueStatus issue={issue} />
            <Pill tone={issue.severity === "high" ? "danger" : issue.severity === "medium" ? "warning" : "neutral"}>
              {t(`severity.${issue.severity}`)}
            </Pill>
          </div>

          {(photos.data?.[0] ?? raisedPhoto) && <MediaImage mediaId={(photos.data?.[0] ?? raisedPhoto)!} alt={t("photo")} />}
          {issue.description && <p className="text-sm leading-relaxed">{issue.description}</p>}

          <dl className="divide-y rounded-xl border text-sm">
            <Row label={t("raisedBy")} value={name(issue.raised_by)} />
            <Row label={t("deadline")} value={fmt(issue.due_at, locale)} danger={late} />
            <Row label={t("owner")} value={issue.assigned_to ? name(issue.assigned_to) : t("notAssigned")} danger={!issue.assigned_to} />
          </dl>

          {canAssign && (
            <div className="space-y-2">
              <p className="text-sm font-bold">{t("assignTo")}</p>
              <div className="flex gap-2">
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger className="h-10 flex-1">
                    <SelectValue placeholder={t("assignTo")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(staff.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                        {p.positions?.name ? ` · ${p.positions.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="h-10 font-bold"
                  disabled={!assignee || assignee === issue.assigned_to || actions.assign.isPending}
                  onClick={() => assignee && actions.assign.mutate({ issueId: issue.id, assigneeId: assignee })}
                >
                  {t("assign")}
                </Button>
              </div>
              <p className="text-muted-foreground text-[13px]">{t("fixOnPhone")}</p>
            </div>
          )}

          {canVerify &&
            (ownFix ? (
              <p className="bg-info-soft text-info rounded-xl px-3 py-2.5 text-sm font-semibold">{t("ownFix")}</p>
            ) : reopening ? (
              <div className="space-y-2">
                <Textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("reopenReason")} aria-label={t("reopenReason")} />
                <div className="flex gap-2">
                  <Button variant="outline" className="h-10" onClick={() => setReopening(false)}>
                    {tc("cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    className="h-10 font-bold"
                    disabled={!note.trim() || actions.verify.isPending}
                    onClick={() => actions.verify.mutate({ issueId: issue.id, accept: false, note: note.trim() }, { onSuccess: onClose })}
                  >
                    {t("reopen")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className="h-10 flex-1" onClick={() => setReopening(true)}>
                  {t("reopen")}
                </Button>
                <Button
                  className="h-10 flex-1 font-bold"
                  disabled={actions.verify.isPending}
                  onClick={() => actions.verify.mutate({ issueId: issue.id, accept: true, note: null }, { onSuccess: onClose })}
                >
                  {t("accept")}
                </Button>
              </div>
            ))}

          <div className="space-y-3">
            <p className="text-sm font-bold">{t("timeline")}</p>
            {events.isPending && <Loader2 className="text-primary size-5 animate-spin" />}
            <ol className="space-y-3">
              {(events.data ?? []).map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span
                    className={cn(
                      "mt-1 size-3 shrink-0 rounded-full",
                      e.type === "escalated" || e.type === "reopened" ? "bg-destructive" : "bg-primary",
                    )}
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-bold">{t(`event.${e.type}`)}</p>
                    <p className="text-muted-foreground text-[13px]">
                      {fmt(e.created_at, locale)}
                      {e.type === "assigned" && e.note ? ` · ${name(e.note)}` : e.type !== "escalated" ? ` · ${name(e.actor_id)}` : ""}
                    </p>
                    {e.note && e.type !== "assigned" && <p className="text-sm">“{e.note}”</p>}
                    {e.media_file_id && e.type !== "created" && <MediaImage mediaId={e.media_file_id} alt={t(`event.${e.type}`)} className="h-36" />}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {canComment && (
            <div className="space-y-2">
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("comment")} aria-label={t("comment")} />
              <Button
                variant="outline"
                className="h-10"
                disabled={!comment.trim() || actions.comment.isPending}
                onClick={() =>
                  actions.comment.mutate({ issueId: issue.id, actorId: me, note: comment.trim() }, { onSuccess: () => setComment("") })
                }
              >
                {t("send")}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-4 px-3.5 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right font-semibold", danger && "text-destructive font-bold")}>{value}</dd>
    </div>
  );
}
