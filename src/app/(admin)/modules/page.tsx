import type { Metadata } from "next";

import { ModulesList } from "@/features/modules/modules-list";

export const metadata: Metadata = { title: "Learning modules" };

export default function Page() {
  return <ModulesList />;
}
