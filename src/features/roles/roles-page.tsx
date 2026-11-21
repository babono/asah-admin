"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DialogActions } from "@/components/admin/dialog-actions";
import { FormInput, FormTextarea } from "@/components/admin/form-fields";
import { IconButton } from "@/components/admin/icon-button";
import { EmptyState, PageHeader, Pill, Section } from "@/components/admin/page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";

import { useGrantCount, usePermissions, useRoleActions, useRolesWithPermissions, type PermissionRow, type RoleRow } from "./api";

/** Permission code prefix -> group on screen. */
const GROUPS: Record<string, string> = {
  org: "setup", outlet: "setup", user: "setup", role: "setup", settings: "setup",
  audit_log: "setup", data: "setup", dashboard: "setup",
  learning: "learning", module: "learning", path: "learning", training: "learning", practical: "learning",
  mentorship: "mentorship", mentor: "mentorship", mentor_rating: "mentorship",
  checklist: "checklists", checklist_template: "checklists", audit: "checklists",
  issue: "issues",
};
const GROUP_ORDER = ["setup", "learning", "mentorship", "checklists", "issues", "other"] as const;

/** Roles and their permissions (PRD R1, R3, R5). */
export function RolesPage() {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const roles = useRolesWithPermissions();
  const permissions = usePermissions();
  const actions = useRoleActions({ saved: tc("saved"), deleted: t("deleted") });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoleRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);

  const list = roles.data ?? [];
  const selected = list.find((r) => r.id === selectedId) ?? list[0] ?? null;

  return (
    <>
      <PageHeader
        breadcrumb={tn("setup")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button className="h-11 px-4 font-bold" onClick={() => setEditing("new")}>
            <Plus /> {t("newRole")}
          </Button>
        }
      />
      {roles.isPending ? (
        <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />
      ) : roles.isError ? (
        <EmptyState>{friendlyError(roles.error)}</EmptyState>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <nav aria-label={t("title")} className="bg-card w-full shrink-0 space-y-0.5 rounded-[18px] border p-2 sm:w-72">
            {list.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                aria-current={selected?.id === r.id}
                className={cn(
                  "w-full rounded-[10px] px-3 py-2.5 text-left",
                  selected?.id === r.id ? "bg-secondary text-primary" : "hover:bg-muted",
                )}
              >
                <span className="block font-bold">{r.name}</span>
                <span className="text-muted-foreground text-[13px]">
                  {t("permissionsCount", { count: r.role_permissions.length })} · {r.is_system ? t("defaultRole") : t("customRole")}
                </span>
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-[1_1_480px]">
            {selected ? (
              <RoleDetail
                role={selected}
                permissions={permissions.data ?? []}
                actions={actions}
                onEdit={() => setEditing(selected)}
                onDelete={() => setDeleting(selected)}
              />
            ) : (
              <EmptyState>{t("pick")}</EmptyState>
            )}
          </div>
        </div>
      )}

      {editing && (
        <RoleDialog
          role={editing === "new" ? null : editing}
          actions={actions}
          onClose={(id) => {
            if (id) setSelectedId(id);
            setEditing(null);
          }}
        />
      )}
      {deleting && <DeleteRoleDialog role={deleting} actions={actions} onClose={() => setDeleting(null)} />}
    </>
  );
}

function RoleDetail({
  role,
  permissions,
  actions,
  onEdit,
  onDelete,
}: {
  role: RoleRow;
  permissions: PermissionRow[];
  actions: ReturnType<typeof useRoleActions>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const has = new Set(role.role_permissions.map((p) => p.permission_code));
  const grouped = useMemo(() => {
    const out = new Map<string, PermissionRow[]>();
    for (const p of permissions) {
      const g = GROUPS[p.code.split(".")[0]] ?? "other";
      out.set(g, [...(out.get(g) ?? []), p]);
    }
    return out;
  }, [permissions]);

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          {role.name}
          <Pill tone={role.is_system ? "neutral" : "info"}>{role.is_system ? t("defaultRole") : t("customRole")}</Pill>
        </span>
      }
      trailing={
        <div className="flex gap-0.5">
          <IconButton label={tc("edit")} onClick={onEdit}>
            <Pencil />
          </IconButton>
          {!role.is_system && (
            <IconButton label={t("deleteRole")} danger onClick={onDelete}>
              <Trash2 />
            </IconButton>
          )}
        </div>
      }
    >
      {role.description && <p className="text-muted-foreground mb-2 text-sm">{role.description}</p>}
      {role.is_system && <p className="text-muted-foreground mb-4 text-[13px]">{t("defaultHint")}</p>}
      <div className="space-y-5">
        {GROUP_ORDER.filter((g) => grouped.has(g)).map((g) => (
          <div key={g}>
            <h3 className="text-muted-foreground mb-1 text-[11px] font-bold tracking-[0.08em] uppercase">{t(`groups.${g}`)}</h3>
            <div className="divide-y">
              {grouped.get(g)!.map((p) => (
                <label key={p.code} className="flex cursor-pointer items-start gap-3 py-2.5">
                  <Checkbox
                    className="mt-0.5"
                    checked={has.has(p.code)}
                    disabled={actions.togglePermission.isPending}
                    onCheckedChange={(on) => actions.togglePermission.mutate({ roleId: role.id, code: p.code, on: on === true })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="text-[13px] font-bold">{p.code}</code>
                      {p.is_sensitive && <Pill tone="warning">{t("sensitive")}</Pill>}
                    </span>
                    <span className="text-muted-foreground block text-[13px]">{p.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function RoleDialog({
  role,
  actions,
  onClose,
}: {
  role: RoleRow | null;
  actions: ReturnType<typeof useRoleActions>;
  onClose: (createdId?: string) => void;
}) {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const schema = z.object({ name: z.string().trim().min(1), description: z.string().trim() });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: role?.name ?? "", description: role?.description ?? "" },
  });
  const submit = form.handleSubmit(async (v) => {
    const id = await actions.saveRole.mutateAsync({ id: role?.id, name: v.name, description: v.description || null });
    onClose(id);
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{role ? t("editRole") : t("newRole")}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="name" label={t("name")} autoFocus />
          <FormTextarea control={form.control} name="description" label={t("description")} rows={2} />
          <DialogActions busy={actions.saveRole.isPending} onCancel={() => onClose()} save={tc("save")} cancel={tc("cancel")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleDialog({ role, actions, onClose }: { role: RoleRow; actions: ReturnType<typeof useRoleActions>; onClose: () => void }) {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const grants = useGrantCount(role.id);
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle", { name: role.name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {grants.isPending ? <Loader2 className="size-4 animate-spin" /> : t("deleteBody", { count: grants.data ?? 0 })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90 text-white"
            disabled={grants.isPending}
            onClick={() => actions.deleteRole.mutate(role.id)}
          >
            {tc("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
