"use client";

import { useQuery } from "@tanstack/react-query";

import { useSupabase } from "@/components/providers";
import { unwrap } from "@/lib/errors";

/**
 * Learning modules (PRD T1-T5). A module is a stable identity; its content
 * lives in numbered versions: draft -> in_review -> published (one at a
 * time) -> retired. Authors need module.author, reviewers module.review;
 * the review RPC refuses an author approving their own module (R7).
 */
export const moduleKeys = {
  all: ["modules"] as const,
  one: (id: string) => ["modules", id] as const,
};

export function useModules() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: moduleKeys.all,
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from("modules")
          // module_versions has two FKs to modules (module_id, prerequisite_module_id)
          .select("id, category, archived_at, created_at, module_versions!module_versions_module_id_fkey(id, version, status, title, author_id, updated_at)")
          .order("created_at", { ascending: false }),
      );
      return rows.map((m) => {
        const versions = [...m.module_versions].sort((a, b) => b.version - a.version);
        return {
          ...m,
          latest: versions[0] ?? null,
          published: versions.find((v) => v.status === "published") ?? null,
        };
      });
    },
  });
}
export type ModuleRow = NonNullable<ReturnType<typeof useModules>["data"]>[number];
