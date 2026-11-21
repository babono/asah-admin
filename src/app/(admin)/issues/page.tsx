import type { Metadata } from "next";

import { IssuesPage } from "@/features/issues/issues-page";

export const metadata: Metadata = { title: "Issues and audits" };

export default function Page() {
  return <IssuesPage />;
}
