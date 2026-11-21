"use client";

import { useTranslations } from "next-intl";

import { Pill } from "@/components/admin/page";
import type { Enums } from "@/lib/database.types";

const tone = {
  draft: "warning",
  in_review: "info",
  changes_requested: "danger",
  published: "primary",
  retired: "neutral",
} as const satisfies Record<Enums<"module_version_status">, string>;

export function VersionStatus({ status }: { status: Enums<"module_version_status"> }) {
  const t = useTranslations("modules.status");
  return <Pill tone={tone[status]}>{t(status)}</Pill>;
}
