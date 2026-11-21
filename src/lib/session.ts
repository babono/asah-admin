"use client";

import { useQuery } from "@tanstack/react-query";

import type { Enums } from "@/lib/database.types";
import { useSupabase } from "@/components/providers";

export type Grant = { code: string; scopeType: Enums<"scope_type">; scopeId: string | null };

export type Outlet = {
  id: string;
  name: string;
  brandId: string;
  areaId: string;
  brandName: string | null;
  areaName: string | null;
};

export type Profile = {
  id: string;
  fullName: string;
  positionName: string | null;
  outletId: string | null;
};

/**
 * What the admin may show. Mirrors app.has_permission() in asah-be: a grant
 * at group scope covers everything; brand, area and outlet scopes cover the
 * outlets inside them. The database checks every action again (PRD R6).
 */
export class Session {
  constructor(
    readonly profile: Profile,
    readonly grants: Grant[],
    readonly outlets: Map<string, Outlet>,
  ) {}

  hasAny(code: string) {
    return this.grants.some((g) => g.code === code);
  }

  hasGroup(code: string) {
    return this.grants.some((g) => g.code === code && g.scopeType === "group");
  }

  can(code: string, outletId?: string | null) {
    const o = outletId ? this.outlets.get(outletId) : undefined;
    return this.grants.some((g) => {
      if (g.code !== code) return false;
      if (g.scopeType === "group") return true;
      if (!o) return false;
      if (g.scopeType === "brand") return g.scopeId === o.brandId;
      if (g.scopeType === "area") return g.scopeId === o.areaId;
      return g.scopeId === o.id;
    });
  }

  outletsWith(code: string) {
    return [...this.outlets.values()].filter((o) => this.can(code, o.id)).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Main role, for the header pill. */
  get roleLabel(): string {
    if (this.hasGroup("user.manage")) return "HQ admin";
    if (this.hasGroup("module.review")) return "Training manager";
    if (this.hasGroup("module.author")) return "HQ trainer";
    if (this.hasGroup("mentor_rating.view_raters")) return "HR and senior management";
    if (this.hasAny("audit.conduct")) return "Area manager";
    if (this.hasAny("issue.assign")) return "Outlet manager";
    return "Viewer";
  }
}

export class NoProfileError extends Error {}

export function useSession() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["session"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new NoProfileError("Not signed in");
      const [profile, grants, outlets] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, outlet_id, positions(name)")
          .eq("id", auth.user.id)
          .maybeSingle(),
        supabase.rpc("my_permissions"),
        supabase
          .from("outlets")
          .select("id, name, brand_id, area_id, brands(name), areas(name)")
          .is("archived_at", null)
          .order("name"),
      ]);
      if (profile.error) throw profile.error;
      if (grants.error) throw grants.error;
      if (outlets.error) throw outlets.error;
      if (!profile.data) throw new NoProfileError("No active profile");
      return new Session(
        {
          id: profile.data.id,
          fullName: profile.data.full_name,
          outletId: profile.data.outlet_id,
          positionName: profile.data.positions?.name ?? null,
        },
        (grants.data ?? []).map((g) => ({ code: g.permission_code, scopeType: g.scope_type, scopeId: g.scope_id })),
        new Map(
          (outlets.data ?? []).map((o) => [
            o.id,
            {
              id: o.id,
              name: o.name,
              brandId: o.brand_id,
              areaId: o.area_id,
              brandName: o.brands?.name ?? null,
              areaName: o.areas?.name ?? null,
            },
          ]),
        ),
      );
    },
  });
}

/** For components rendered inside the shell, where the session is loaded. */
export function useRequiredSession(): Session {
  const { data } = useSession();
  if (!data) throw new Error("useRequiredSession outside the admin shell");
  return data;
}
