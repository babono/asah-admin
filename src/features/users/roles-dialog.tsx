"use client";

import { Loader2, ShieldMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { IconButton } from "@/components/admin/icon-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Enums } from "@/lib/database.types";
import { useRequiredSession } from "@/lib/session";

import { useGrants, useRoles, type GrantRow, type UserRow, type useUserActions } from "./api";

type ScopeType = Enums<"scope_type">;

/** A user's roles, each granted within a scope (PRD R2, R3). */
export function RolesDialog({
  user,
  actions,
  onClose,
}: {
  user: UserRow;
  actions: ReturnType<typeof useUserActions>;
  onClose: () => void;
}) {
  const t = useTranslations("users");
  const session = useRequiredSession();
  const grants = useGrants(user.id);
  const roles = useRoles(true);

  // Names for every brand, area and outlet the admin can see.
  const scopes = useMemo(() => {
    const brand = new Map<string, string>();
    const area = new Map<string, string>();
    const outlet = new Map<string, string>();
    for (const o of session.outlets.values()) {
      brand.set(o.brandId, o.brandName ?? "");
      area.set(o.areaId, o.areaName ?? "");
      outlet.set(o.id, o.name);
    }
    return { brand, area, outlet };
  }, [session]);

  const scopeLabel = (g: GrantRow) => {
    if (g.scope_type === "group") return t("scopeGroup");
    const name = g.scope_id ? scopes[g.scope_type].get(g.scope_id) : undefined;
    return `${t(scopeTypeKey[g.scope_type])}: ${name ?? g.scope_id}`;
  };

  const [roleId, setRoleId] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<ScopeType>("outlet");
  const [scopeId, setScopeId] = useState<string | null>(user.outlet_id);
  const targets = scopeType === "group" ? [] : [...scopes[scopeType].entries()];
  const effectiveScopeId = scopeType === "group" ? null : targets.some(([id]) => id === scopeId) ? scopeId : (targets[0]?.[0] ?? null);
  const canGrant = Boolean(roleId) && (scopeType === "group" || Boolean(effectiveScopeId));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("rolesTitle", { name: user.full_name })}</DialogTitle>
          <DialogDescription>{t("auditNote")}</DialogDescription>
        </DialogHeader>

        <div className="divide-y rounded-xl border">
          {grants.isPending && <Loader2 className="text-primary mx-auto my-4 size-5 animate-spin" />}
          {grants.data?.length === 0 && <p className="text-muted-foreground p-3 text-sm">{t("noRoles")}</p>}
          {grants.data?.map((g) => (
            <div key={g.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{g.roles?.name}</p>
                <p className="text-muted-foreground text-[13px]">{scopeLabel(g)}</p>
              </div>
              <IconButton label={t("remove")} danger onClick={() => actions.revokeRole.mutate({ userId: user.id, grantId: g.id })}>
                <ShieldMinus />
              </IconButton>
            </div>
          ))}
        </div>

        <div className="bg-background space-y-3 rounded-xl p-3">
          <p className="text-sm font-bold">{t("grant")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <FieldLabel>{t("role")}</FieldLabel>
              <Select value={roleId ?? undefined} onValueChange={setRoleId}>
                <SelectTrigger className="h-10 w-full bg-white">
                  <SelectValue placeholder={t("role")} />
                </SelectTrigger>
                <SelectContent>
                  {(roles.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>{t("scope")}</FieldLabel>
              <Select value={scopeType} onValueChange={(v) => setScopeType(v as ScopeType)}>
                <SelectTrigger className="h-10 w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["outlet", "area", "brand", "group"] as const).map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(scopeTypeKey[s])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {scopeType !== "group" && (
              <div className="space-y-1.5">
                <FieldLabel>{t("scopeTarget")}</FieldLabel>
                <Select value={effectiveScopeId ?? undefined} onValueChange={setScopeId}>
                  <SelectTrigger className="h-10 w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <Button
            className="h-10 font-bold"
            disabled={!canGrant || actions.grantRole.isPending}
            onClick={() =>
              roleId &&
              actions.grantRole.mutate({ userId: user.id, roleId, scopeType, scopeId: effectiveScopeId })
            }
          >
            {actions.grantRole.isPending && <Loader2 className="animate-spin" />}
            {t("grant")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const scopeTypeKey = {
  outlet: "scopeOutlet",
  area: "scopeArea",
  brand: "scopeBrand",
  group: "scopeGroup",
} as const satisfies Record<ScopeType, string>;
