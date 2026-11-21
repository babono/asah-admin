"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { MediaImage } from "@/components/admin/media-image";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRequiredSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { useRunResponses, type AuditRow } from "./api";

/** Item-by-item result of a visit audit; failed items became issues (S4). */
export function AuditDialog({ audit, onClose }: { audit: AuditRow; onClose: () => void }) {
  const t = useTranslations("issues");
  const session = useRequiredSession();
  const items = useRunResponses(audit.id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("auditResult")}</DialogTitle>
          <DialogDescription>
            {session.outlets.get(audit.outlet_id)?.name} · {audit.checklist_template_versions?.checklist_templates?.name}
            {audit.compliance_pct != null && ` · ${Math.round(audit.compliance_pct)}%`}
          </DialogDescription>
        </DialogHeader>
        {items.isPending ? (
          <Loader2 className="text-primary mx-auto my-6 size-6 animate-spin" />
        ) : (
          <div className="divide-y">
            {(items.data ?? []).map((i) => {
              const r = i.response;
              const value = !r
                ? t("notAnswered")
                : i.answer_type === "yes_no"
                  ? r.value_bool == null
                    ? "–"
                    : r.value_bool
                      ? t("yes")
                      : t("no")
                  : i.answer_type === "number"
                    ? `${r.value_number ?? "–"} ${i.unit ?? ""}`.trim()
                    : (r.value_text ?? "–");
              const failed = r && !r.passed;
              return (
                <div key={i.id} className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{i.label}</p>
                    <span className={cn("shrink-0 font-bold", failed ? "text-destructive" : "")}>{value}</span>
                  </div>
                  {failed && <p className="text-destructive text-[13px] font-semibold">{t("failedItem")}</p>}
                  {r?.checklist_response_photos.map((p) => (
                    <MediaImage key={p.media_file_id} mediaId={p.media_file_id} alt={i.label} className="h-36" />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
