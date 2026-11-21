import type { Metadata } from "next";

import { OrgPage } from "@/features/org/org-page";

export const metadata: Metadata = { title: "Positions and levels" };

export default function Page() {
  return <OrgPage />;
}
