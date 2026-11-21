import type { Metadata } from "next";

import { PathsPage } from "@/features/paths/paths-page";

export const metadata: Metadata = { title: "Learning paths" };

export default function Page() {
  return <PathsPage />;
}
