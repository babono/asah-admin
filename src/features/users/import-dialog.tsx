"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Papa from "papaparse";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePositions } from "@/features/org/api";
import { isPlausiblePhone, toE164 } from "@/lib/phone";
import { useRequiredSession } from "@/lib/session";

import type { CreateResult, NewUser, useUserActions } from "./api";

/** Accepted column names, English and Bahasa (lower-cased). */
const COLUMNS = {
  name: ["name", "full_name", "full name", "nama"],
  phone: ["phone", "phone_number", "hp", "nomor hp", "no hp"],
  outlet: ["outlet"],
  position: ["position", "posisi", "jabatan"],
  firstDay: ["first_day", "first day", "hire_date", "tanggal masuk"],
} as const;

type Parsed = { ready: NewUser[]; problems: string[] };

/** Bulk import from a spreadsheet saved as CSV (PRD F4). */
export function ImportDialog({ actions, onClose }: { actions: ReturnType<typeof useUserActions>; onClose: () => void }) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const session = useRequiredSession();
  const positions = usePositions();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [results, setResults] = useState<CreateResult[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  function parse(file: File) {
    setFileError(null);
    setResults(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.replace(/^﻿/, "").trim().toLowerCase(),
      complete: ({ data, meta }) => {
        const fields = meta.fields ?? [];
        const col = (names: readonly string[]) => fields.find((f) => names.includes(f));
        const c = {
          name: col(COLUMNS.name),
          phone: col(COLUMNS.phone),
          outlet: col(COLUMNS.outlet),
          position: col(COLUMNS.position),
          firstDay: col(COLUMNS.firstDay),
        };
        if (!c.name || !c.phone) {
          setFileError(t("missingColumns"));
          setParsed(null);
          return;
        }
        const outletByName = new Map([...session.outlets.values()].map((o) => [o.name.trim().toLowerCase(), o.id]));
        const positionByName = new Map((positions.data ?? []).map((p) => [p.name.trim().toLowerCase(), p.id]));
        const ready: NewUser[] = [];
        const problems: string[] = [];

        data.forEach((r, i) => {
          const rowNo = i + 2; // header is row 1
          const get = (k?: string) => (k ? (r[k] ?? "").trim() : "");
          const name = get(c.name);
          const phone = get(c.phone);
          const outlet = get(c.outlet);
          const position = get(c.position);
          const firstDay = get(c.firstDay);
          const outletId = outlet ? outletByName.get(outlet.toLowerCase()) : null;
          const positionId = position ? positionByName.get(position.toLowerCase()) : null;

          const issues: string[] = [];
          if (!name) issues.push(t("missingName"));
          if (!isPlausiblePhone(phone)) issues.push(t("phoneInvalid"));
          if (outlet && !outletId) issues.push(t("unknownOutlet", { name: outlet }));
          if (position && !positionId) issues.push(t("unknownPosition", { name: position }));
          if (firstDay && !/^\d{4}-\d{2}-\d{2}$/.test(firstDay)) issues.push(t("badDate"));

          if (issues.length) problems.push(`${t("row", { row: rowNo })}: ${issues.join(", ")}`);
          else
            ready.push({
              full_name: name,
              phone: toE164(phone),
              outlet_id: outletId ?? null,
              position_id: positionId ?? null,
              hire_date: firstDay || null,
            });
        });
        setParsed({ ready, problems });
      },
      error: (e) => setFileError(e.message),
    });
  }

  async function run() {
    if (!parsed?.ready.length) return;
    setResults(await actions.createUsers.mutateAsync(parsed.ready));
  }

  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("importTitle")}</DialogTitle>
          <DialogDescription>{t("importHelp")}</DialogDescription>
        </DialogHeader>

        {!results && (
          <label className="border-input hover:border-primary flex cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed p-6 text-sm font-semibold">
            <FileSpreadsheet className="text-primary size-5" />
            {t("chooseFile")}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) parse(file);
                e.target.value = "";
              }}
            />
          </label>
        )}

        {fileError && <p className="text-destructive text-sm font-semibold">{fileError}</p>}

        {parsed && !results && (
          <div className="space-y-2 text-sm">
            <p className="font-bold">{t("readyRows", { count: parsed.ready.length })}</p>
            {parsed.problems.length > 0 && (
              <>
                <p className="text-destructive font-bold">{t("problemRows", { count: parsed.problems.length })}</p>
                <ul className="bg-danger-soft max-h-40 list-disc overflow-y-auto rounded-lg py-2 pr-2 pl-7 text-[13px]">
                  {parsed.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {results && (
          <div className="space-y-2 text-sm">
            <p className="font-bold">{t("importDone", { ok: results.length - failed.length, total: results.length })}</p>
            {failed.length > 0 && (
              <>
                <p className="text-destructive font-bold">{t("notImported")}</p>
                <ul className="bg-danger-soft max-h-40 list-disc overflow-y-auto rounded-lg py-2 pr-2 pl-7 text-[13px]">
                  {failed.map((f) => (
                    <li key={f.phone}>
                      {f.phone}: {f.error}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={onClose}>
            {results ? tc("ok") : tc("cancel")}
          </Button>
          {!results && (
            <Button className="h-10 font-bold" disabled={!parsed?.ready.length || actions.createUsers.isPending} onClick={run}>
              {actions.createUsers.isPending && <Loader2 className="animate-spin" />}
              {t("importRun", { count: parsed?.ready.length ?? 0 })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
