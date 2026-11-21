import type { Metadata } from "next";

import { DashboardPage } from "@/features/dashboard/dashboard-page";

export const metadata: Metadata = { title: "Dashboards" };

export default function Page() {
  return <DashboardPage />;
}
