"use client";

import { useTranslations } from "next-intl";

import { Pill } from "@/components/admin/page";

import type { IssueRow } from "./api";

/** Status as a manager reads it: closed, waiting for a check, escalated, unowned, late, open. */
export function IssueStatus({ issue }: { issue: IssueRow }) {
  const t = useTranslations("issues");
  if (issue.status === "closed") return <Pill>{t("closed")}</Pill>;
  if (issue.status === "fixed") return <Pill tone="info">{t("fixed")}</Pill>;
  if (issue.escalated_at) return <Pill tone="danger">{t("escalated")}</Pill>;
  if (!issue.assigned_to) return <Pill tone="danger">{t("notAssigned")}</Pill>;
  if (issue.due_at < new Date().toISOString()) return <Pill tone="danger">{t("late")}</Pill>;
  return <Pill tone="warning">{t("open")}</Pill>;
}
