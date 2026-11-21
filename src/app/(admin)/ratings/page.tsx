import type { Metadata } from "next";

import { RatingsPage } from "@/features/ratings/ratings-page";

export const metadata: Metadata = { title: "Mentor ratings" };

export default function Page() {
  return <RatingsPage />;
}
