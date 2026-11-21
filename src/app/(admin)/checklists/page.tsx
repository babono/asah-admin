import type { Metadata } from "next";

import { TemplatesList } from "@/features/checklists/templates-list";

export const metadata: Metadata = { title: "Checklist templates" };

export default function ChecklistTemplatesPage() {
  return <TemplatesList />;
}
