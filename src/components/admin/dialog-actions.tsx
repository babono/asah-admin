"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

/** Cancel + Save row shared by the setup dialogs. */
export function DialogActions({ busy, onCancel, save, cancel }: { busy: boolean; onCancel: () => void; save: string; cancel: string }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" className="h-10" onClick={onCancel}>
        {cancel}
      </Button>
      <Button type="submit" className="h-10 font-bold" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {save}
      </Button>
    </DialogFooter>
  );
}
