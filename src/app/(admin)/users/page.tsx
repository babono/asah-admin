import type { Metadata } from "next";

import { UsersPage } from "@/features/users/users-page";

export const metadata: Metadata = { title: "Users and roles" };

export default function Page() {
  return <UsersPage />;
}
