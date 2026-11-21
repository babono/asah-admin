"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { onTimePct, type WeekPoint } from "./api";

const PLOT_HEIGHT = 160;
const GRID = [0, 50, 100];

/**
 * Weekly share of checklist runs done on time (PRD S5). One series, so no
 * legend box: the section title names it. Columns at most 24px with a 4px
 * rounded cap; weeks below target use the warning colour and say so in the
 * tooltip and the key, never colour alone. Every value is also in the table.
 */
export function TrendChart({ weekly, target }: { weekly: WeekPoint[]; target: number }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [asTable, setAsTable] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const fmtWeek = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`));
  const points = weekly.map((w) => ({ ...w, pct: onTimePct(w) ?? 0 }));

  if (points.length === 0) return <p className="text-muted-foreground text-sm">{t("trendEmpty")}</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setAsTable(!asTable)}>
          {asTable ? t("showChart") : t("showTable")}
        </Button>
      </div>

      {asTable ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colWeek")}</TableHead>
              <TableHead className="text-right">{t("colRuns")}</TableHead>
              <TableHead className="text-right">{t("colOnTimeCount")}</TableHead>
              <TableHead className="text-right">{t("colPct")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {points.map((p) => (
              <TableRow key={p.week}>
                <TableCell>{t("weekOf", { date: fmtWeek(p.week) })}</TableCell>
                <TableCell className="text-right tabular-nums">{p.runs}</TableCell>
                <TableCell className="text-right tabular-nums">{p.onTime}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {Math.round(p.pct)}%{p.pct < target && <span className="text-muted-foreground"> · {t("belowTarget")}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="flex gap-3">
          {/* y axis */}
          <div className="text-muted-foreground relative w-9 shrink-0 text-right text-[11px] tabular-nums" style={{ height: PLOT_HEIGHT }}>
            {GRID.map((g) => (
              <span key={g} className="absolute right-0 -translate-y-1/2" style={{ top: PLOT_HEIGHT * (1 - g / 100) }}>
                {g}%
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative" style={{ height: PLOT_HEIGHT }}>
              {GRID.map((g) => (
                <div key={g} className="bg-border absolute inset-x-0 h-px" style={{ top: PLOT_HEIGHT * (1 - g / 100) }} />
              ))}
              {/* target: a threshold, so this one line is dashed and labelled */}
              <div className="absolute inset-x-0 border-t border-dashed border-[#8a8f8c]" style={{ top: PLOT_HEIGHT * (1 - target / 100) }}>
                <span className="text-muted-foreground bg-card absolute -top-2.5 right-0 pl-1 text-[11px] font-semibold">
                  {t("target", { pct: target })}
                </span>
              </div>
              <div className="absolute inset-0 flex items-end">
                {points.map((p, i) => {
                  const below = p.pct < target;
                  const last = i === points.length - 1;
                  return (
                    <button
                      key={p.week}
                      type="button"
                      aria-label={`${t("weekOf", { date: fmtWeek(p.week) })}: ${t("weekValue", { onTime: p.onTime, runs: p.runs, pct: Math.round(p.pct) })}${below ? `, ${t("belowTarget")}` : ""}`}
                      onMouseEnter={() => setActive(i)}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive(null)}
                      className="group relative flex h-full flex-1 items-end justify-center outline-none"
                    >
                      {/* tooltip */}
                      {active === i && (
                        <span className="bg-foreground pointer-events-none absolute bottom-full z-10 mb-1 rounded-md px-2 py-1 text-left text-[11px] whitespace-nowrap text-white shadow">
                          <span className="block font-bold">{t("weekOf", { date: fmtWeek(p.week) })}</span>
                          {t("weekValue", { onTime: p.onTime, runs: p.runs, pct: Math.round(p.pct) })}
                          {below && <span className="block">{t("belowTarget")}</span>}
                        </span>
                      )}
                      {/* direct label only on the latest week */}
                      {last && (
                        <span
                          className="text-foreground absolute text-[12px] font-bold"
                          style={{ bottom: `${(p.pct / 100) * PLOT_HEIGHT + 4}px` }}
                        >
                          {Math.round(p.pct)}%
                        </span>
                      )}
                      <span
                        className={cn(
                          "block w-full max-w-6 rounded-t-[4px] group-focus-visible:ring-2 group-focus-visible:ring-ring",
                          below ? "bg-below-target" : "bg-primary",
                          active !== null && active !== i && "opacity-60",
                        )}
                        style={{ height: `${Math.max(p.pct, 1)}%` }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
            {/* x axis */}
            <div className="text-muted-foreground mt-1.5 flex text-[11px]">
              {points.map((p) => (
                <span key={p.week} className="flex-1 text-center">
                  {fmtWeek(p.week)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-primary size-2.5 rounded-[3px]" /> {t("atTarget", { pct: target })}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-below-target size-2.5 rounded-[3px]" /> {t("belowTarget")}
        </span>
      </div>
    </div>
  );
}
