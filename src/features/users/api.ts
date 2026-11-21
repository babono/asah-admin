"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSupabase } from "@/components/providers";
import type { Enums } from "@/lib/database.types";
import { friendlyError, unwrap } from "@/lib/errors";
import { useRequiredSession } from "@/lib/session";

/**
 * Users and role grants (PRD F4, R2-R4, R8).
 * - Accounts are created by asah-be's admin-users Edge Function (it needs the
 *   service role to create the login); it grants only the Staff role.
 * - Profiles are edited directly (RLS: user.manage); deactivating fires the
 *   trigger that removes roles and ends mentorships.
 * - Role grants are rows in user_roles (RLS: role.manage), audit-logged.
 */
export const userKeys = {
  all: ["users"] as const,
  roles: ["roles"] as const,
  grants: (userId: string) => ["users", userId, "grants"] as const,
};

export function useUsers() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: userKeys.all,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("profiles")
          .select("id, full_name, phone, position_id, outlet_id, hire_date, locale, status, positions(name, level)")
          .order("full_name"),
      ),
  });
}
export type UserRow = NonNullable<ReturnType<typeof useUsers>["data"]>[number];

export function useRoles(enabled: boolean) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: userKeys.roles,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => unwrap(await supabase.from("roles").select("id, name, description").order("name")),
  });
}

export function useGrants(userId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: userKeys.grants(userId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("user_roles")
          .select("id, scope_type, scope_id, granted_at, roles(name)")
          .eq("user_id", userId)
          .order("granted_at"),
      ),
  });
}
export type GrantRow = NonNullable<ReturnType<typeof useGrants>["data"]>[number];

export type NewUser = {
  full_name: string;
  phone: string;
  outlet_id: string | null;
  position_id: string | null;
  hire_date: string | null;
  locale?: "id" | "en";
};
export type CreateResult = { phone: string; ok: boolean; user_id?: string; error?: string };

export function useUserActions(msgs: { saved: string; granted: string; revoked: string }) {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const me = useRequiredSession().profile.id;
  const refresh = (userId?: string) => {
    void qc.invalidateQueries({ queryKey: userKeys.all });
    if (userId) void qc.invalidateQueries({ queryKey: userKeys.grants(userId) });
  };
  const onError = (e: unknown) => toast.error(friendlyError(e));

  /** One user or a whole spreadsheet; each row succeeds or fails on its own. */
  const createUsers = useMutation({
    mutationFn: async (users: NewUser[]): Promise<CreateResult[]> => {
      const { data, error } = await supabase.functions.invoke<{ results: CreateResult[] }>("admin-users", {
        body: { users },
      });
      if (error) throw new Error(await functionError(error));
      return data?.results ?? [];
    },
    onSuccess: () => refresh(),
    onError,
  });

  const updateProfile = useMutation({
    mutationFn: async (v: {
      id: string;
      full_name: string;
      outlet_id: string | null;
      position_id: string | null;
      hire_date: string | null;
      locale: "id" | "en";
    }) => {
      const { id, ...values } = v;
      return unwrap(await supabase.from("profiles").update(values).eq("id", id));
    },
    onSuccess: (_r, v) => {
      toast.success(msgs.saved);
      refresh(v.id);
    },
    onError,
  });

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: Enums<"user_status"> }) =>
      unwrap(await supabase.from("profiles").update({ status: v.status }).eq("id", v.id)),
    onSuccess: (_r, v) => refresh(v.id),
    onError,
  });

  const grantRole = useMutation({
    mutationFn: async (v: { userId: string; roleId: string; scopeType: Enums<"scope_type">; scopeId: string | null }) =>
      unwrap(
        await supabase.from("user_roles").insert({
          user_id: v.userId,
          role_id: v.roleId,
          scope_type: v.scopeType,
          scope_id: v.scopeType === "group" ? null : v.scopeId,
          granted_by: me,
        }),
      ),
    onSuccess: (_r, v) => {
      toast.success(msgs.granted);
      refresh(v.userId);
    },
    onError,
  });

  const revokeRole = useMutation({
    mutationFn: async (v: { userId: string; grantId: string }) =>
      unwrap(await supabase.from("user_roles").delete().eq("id", v.grantId)),
    onSuccess: (_r, v) => {
      toast.success(msgs.revoked);
      refresh(v.userId);
    },
    onError,
  });

  return { createUsers, updateProfile, setStatus, grantRole, revokeRole };
}

/** Edge Function errors carry the server's JSON body ({ error }) in the response. */
async function functionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch {
      // fall through
    }
  }
  return friendlyError(error);
}
