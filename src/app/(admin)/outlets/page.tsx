import type { Metadata } from "next";

import { OutletsPage } from "@/features/outlets/outlets-page";

export const metadata: Metadata = { title: "Outlets" };

export default function Page() {
  return <OutletsPage />;
}
