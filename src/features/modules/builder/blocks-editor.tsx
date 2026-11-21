"use client";

import { ArrowDown, ArrowUp, ExternalLink, FileText, Film, NotebookText, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { EmptyState, Pill } from "@/components/admin/page";
import { useSupabase } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/admin/progress";
import { Textarea } from "@/components/ui/textarea";
import { friendlyError } from "@/lib/errors";
import { useRequiredSession } from "@/lib/session";
import { signedMediaUrl, uploadTrainingFile } from "@/lib/storage-upload";
import { uploadVideo } from "@/lib/video-upload";

import type { Block, ModuleActions, ModuleDetail } from "../api";

const icons = { video: Film, sop_card: NotebookText, document: FileText } as const;
const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Videos, SOP cards and PDFs, in the order staff see them (PRD T1). */
export function BlocksEditor({ d, actions, editable }: { d: ModuleDetail; actions: ModuleActions; editable: boolean }) {
  const t = useTranslations("modules.builder");
  const tc = useTranslations("common");
  const supabase = useSupabase();
  const me = useRequiredSession().profile.id;
  const [upload, setUpload] = useState<{ name: string; pct: number } | null>(null);
  const [sop, setSop] = useState<Block | "new" | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);

  async function addFile(file: File, type: "video" | "document") {
    setUpload({ name: file.name, pct: 0 });
    try {
      const mediaId =
        type === "video"
          ? await uploadVideo(supabase, file, "training_video", { onProgress: (f) => setUpload({ name: file.name, pct: Math.round(f * 100) }) })
          : await uploadTrainingFile(supabase, file, "training_document", me);
      await actions.addBlock.mutateAsync({ type, title: file.name.replace(/\.[^.]+$/, ""), media_file_id: mediaId });
      if (type === "video") toast.success(t("uploaded"));
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setUpload(null);
    }
  }

  async function open(mediaId: string) {
    try {
      window.open(await signedMediaUrl(supabase, mediaId), "_blank", "noopener");
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const detail = (b: Block) => {
    if (b.type === "video") {
      const m = b.media_files;
      return [
        t("video"),
        m?.duration_seconds ? fmtDuration(m.duration_seconds) : null,
        m && m.status !== "ready" ? (m.status === "failed" ? t("failed") : t("processing")) : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    if (b.type === "document") return t("pdf");
    const lines = (b.body ?? "").split("\n").filter((l) => l.trim()).length;
    return [t("sopCard"), t("lines", { count: lines }), b.media_file_id ? t("withPhoto") : null].filter(Boolean).join(" · ");
  };

  return (
    <div className="space-y-2">
      {d.blocks.length === 0 && <EmptyState>{t("noContent")}</EmptyState>}
      {d.blocks.map((b, i) => {
        const Icon = icons[b.type];
        return (
          <div key={b.id} className="border-input flex items-center gap-3 rounded-[10px] border-[1.5px] px-3.5 py-1.5">
            <Icon className="text-text-strong size-5 shrink-0" />
            <div className="min-w-0 flex-1 py-1">
              <p className="truncate font-bold">{b.title || t("sopCard")}</p>
              <p className="text-muted-foreground text-[13px]">{detail(b)}</p>
            </div>
            {b.type === "video" && b.media_files?.status === "failed" && <Pill tone="danger">{t("failed")}</Pill>}
            {b.type === "document" && b.media_file_id && (
              <IconButton label={t("open")} onClick={() => open(b.media_file_id!)}>
                <ExternalLink />
              </IconButton>
            )}
            {editable && (
              <>
                <IconButton label={tc("moveUp")} disabled={i === 0} onClick={() => actions.moveBlock.mutate({ a: b, b: d.blocks[i - 1] })}>
                  <ArrowUp />
                </IconButton>
                <IconButton
                  label={tc("moveDown")}
                  disabled={i === d.blocks.length - 1}
                  onClick={() => actions.moveBlock.mutate({ a: b, b: d.blocks[i + 1] })}
                >
                  <ArrowDown />
                </IconButton>
                {b.type === "sop_card" && (
                  <IconButton label={tc("edit")} onClick={() => setSop(b)}>
                    <Pencil />
                  </IconButton>
                )}
                <IconButton label={tc("delete")} danger onClick={() => actions.deleteBlock.mutate(b.id)}>
                  <Trash2 />
                </IconButton>
              </>
            )}
          </div>
        );
      })}

      {upload && (
        <div className="space-y-1.5 py-2">
          <p className="text-sm">{t("uploading", { name: upload.name, pct: upload.pct })}</p>
          <Progress value={upload.pct} />
        </div>
      )}

      {editable && (
        <div className="flex flex-wrap gap-2.5 pt-2">
          <Button variant="outline" className="h-10" disabled={Boolean(upload)} onClick={() => videoInput.current?.click()}>
            <Film /> {t("addVideo")}
          </Button>
          <Button variant="outline" className="h-10" onClick={() => setSop("new")}>
            <NotebookText /> {t("addSop")}
          </Button>
          <Button variant="outline" className="h-10" disabled={Boolean(upload)} onClick={() => pdfInput.current?.click()}>
            <FileText /> {t("addPdf")}
          </Button>
          <input
            ref={videoInput}
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void addFile(f, "video");
              e.target.value = "";
            }}
          />
          <input
            ref={pdfInput}
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void addFile(f, "document");
              e.target.value = "";
            }}
          />
        </div>
      )}

      {sop && <SopDialog block={sop === "new" ? null : sop} actions={actions} onClose={() => setSop(null)} />}
    </div>
  );
}

function SopDialog({ block, actions, onClose }: { block: Block | null; actions: ModuleActions; onClose: () => void }) {
  const t = useTranslations("modules.builder");
  const tc = useTranslations("common");
  const supabase = useSupabase();
  const me = useRequiredSession().profile.id;
  const [title, setTitle] = useState(block?.title ?? "");
  const [body, setBody] = useState(block?.body ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const media_file_id = photo ? await uploadTrainingFile(supabase, photo, "training_image", me) : (block?.media_file_id ?? null);
      const values = { title: title.trim() || null, body, media_file_id };
      if (block) await actions.updateBlock.mutateAsync({ id: block.id, ...values });
      else await actions.addBlock.mutateAsync({ type: "sop_card", ...values });
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("sopTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sop-title">{t("blockTitle")}</Label>
            <Input id="sop-title" className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sop-body">{t("steps")}</Label>
            <Textarea id="sop-body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sop-photo">{t("photo")}</Label>
            <Input id="sop-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            {block?.media_file_id && !photo && <p className="text-muted-foreground text-[13px]">{t("keepPhoto")}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button className="h-10 font-bold" disabled={busy || !body.trim()} onClick={save}>
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
