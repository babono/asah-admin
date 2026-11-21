"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useSupabase } from "@/components/providers";
import { friendlyError, unwrap } from "@/lib/errors";

/**
 * Roles are named bundles of permissions (PRD R1, R3). Everything here needs
 * role.manage and is written to the audit log by asah-be (F9, R5).
 */
export const roleKeys = {
  roles: ["roles", "with-permissions"] as const,
  permissions: ["permissions"] as const,
  grantCount: (roleId: string) => ["roles", roleId, "grant-count"] as const,
};

export function useRolesWithPermissions() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: roleKeys.roles,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("roles")
          .select("id, name, description, is_system, role_permissions(permission_code)")
          .order("is_system", { ascending: false })
          .order("name"),
      ),
  });
}
export type RoleRow = NonNullable<ReturnType<typeof useRolesWithPermissions>["data"]>[number];

export function usePermissions() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: roleKeys.permissions,
    staleTime: Infinity,
    queryFn: async () => unwrap(await supabase.from("permissions").select("code, description, is_sensitive").order("code")),
  });
}
export type PermissionRow = NonNullable<ReturnType<typeof usePermissions>["data"]>[number];

/** How many people hold a role (deleting a role removes their grants). */
export function useGrantCount(roleId: string | null) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: roleKeys.grantCount(roleId ?? ""),
    enabled: Boolean(roleId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role_id", roleId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function useRoleMutation<V, R = unknown>(fn: (v: V) => Promise<R>, success?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (success) toast.success(success);
      void qc.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
}

export function useRoleActions(msgs: { saved: string; deleted: string }) {
  const supabase = useSupabase();

  const togglePermission = useRoleMutation(async (v: { roleId: string; code: string; on: boolean }) =>
    v.on
      ? unwrap(await supabase.from("role_permissions").insert({ role_id: v.roleId, permission_code: v.code }))
      : unwrap(await supabase.from("role_permissions").delete().eq("role_id", v.roleId).eq("permission_code", v.code)),
  );

  const saveRole = useRoleMutation(async (v: { id?: string; name: string; description: string | null }) => {
    if (v.id) {
      unwrap(await supabase.from("roles").update({ name: v.name, description: v.description }).eq("id", v.id));
      return v.id;
    }
    return unwrap(await supabase.from("roles").insert({ name: v.name, description: v.description }).select("id").single()).id;
  }, msgs.saved);

  const deleteRole = useRoleMutation(
    async (roleId: string) => unwrap(await supabase.from("roles").delete().eq("id", roleId)),
    msgs.deleted,
  );

  return { togglePermission, saveRole, deleteRole };
}
