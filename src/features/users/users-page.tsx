"use client";

import { Loader2, Pencil, Search, ShieldCheck, Upload, UserPlus, UserRoundCheck, UserRoundX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable, type AdminColumn } from "@/components/admin/data-table";
import { IconButton } from "@/components/admin/icon-button";
import { NULL_OPTION } from "@/components/admin/form-fields";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { friendlyError } from "@/lib/errors";
import { fmtDate } from "@/lib/format";
import { useRequiredSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { useUserActions, useUsers, type UserRow } from "./api";
import { ImportDialog } from "./import-dialog";
import { RolesDialog } from "./roles-dialog";
import { UserDialog } from "./user-dialog";

type Open =
  | { kind: "user"; user: UserRow | null }
  | { kind: "roles"; user: UserRow }
  | { kind: "status"; user: UserRow }
  | { kind: "import" }
  | null;

/** Users and roles (PRD F4, R2-R4, R8). */
export function UsersPage() {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const session = useRequiredSession();
  const users = useUsers();
  const actions = useUserActions({ saved: tc("saved"), granted: t("granted"), revoked: t("revoked") });
  const canManage = session.hasGroup("user.manage");
  const canRoles = session.hasGroup("role.manage");

  const [query, setQuery] = useState("");
  const [outletId, setOutletId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState<Open>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users.data ?? []).filter(
      (u) =>
        (showInactive || u.status === "active") &&
        (!outletId || u.outlet_id === outletId) &&
        (!q || u.full_name.toLowerCase().includes(q) || (u.phone ?? "").includes(q.replace(/\s/g, ""))),
    );
  }, [users.data, query, outletId, showInactive]);

  const columns = useMemo<AdminColumn<UserRow>[]>(
    () => [
      {
        id: "name",
        header: t("colName"),
        accessorFn: (u) => u.full_name,
        cell: ({ row }) => (
          <span className={cn("font-bold", row.original.status !== "active" && "text-muted-foreground")}>{row.original.full_name}</span>
        ),
      },
      { id: "phone", header: t("colPhone"), enableSorting: false, cell: ({ row }) => <span className="tabular-nums">{row.original.phone ?? "–"}</span> },
      {
        id: "position",
        header: t("colPosition"),
        accessorFn: (u) => u.positions?.name ?? "",
        cell: ({ row }) =>
          row.original.positions ? `${row.original.positions.name} · L${row.original.positions.level}` : <span className="text-muted-foreground">–</span>,
      },
      {
        id: "outlet",
        header: t("colOutlet"),
        accessorFn: (u) => (u.outlet_id ? (session.outlets.get(u.outlet_id)?.name ?? "") : ""),
        cell: ({ getValue }) => (getValue() as string) || <span className="text-muted-foreground">–</span>,
      },
      { id: "started", header: t("colStarted"), accessorFn: (u) => u.hire_date ?? "", cell: ({ row }) => fmtDate(row.original.hire_date) },
      {
        id: "status",
        header: t("colStatus"),
        accessorFn: (u) => u.status,
        cell: ({ row }) =>
          row.original.status === "active" ? <Pill>{t("active")}</Pill> : <Pill tone="neutral">{t("inactive")}</Pill>,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-0.5">
            {canRoles && (
              <IconButton label={t("roles")} onClick={() => setOpen({ kind: "roles", user: row.original })}>
                <ShieldCheck />
              </IconButton>
            )}
            {canManage && (
              <IconButton label={tc("edit")} onClick={() => setOpen({ kind: "user", user: row.original })}>
                <Pencil />
              </IconButton>
            )}
            {canManage &&
              (row.original.status === "active" ? (
                <IconButton label={t("deactivate")} danger onClick={() => setOpen({ kind: "status", user: row.original })}>
                  <UserRoundX />
                </IconButton>
              ) : (
                <IconButton
                  label={t("reactivate")}
                  onClick={() =>
                    actions.setStatus.mutate(
                      { id: row.original.id, status: "active" },
                      { onSuccess: () => toast.success(t("reactivated")) },
                    )
                  }
                >
                  <UserRoundCheck />
                </IconButton>
              ))}
          </div>
        ),
      },
    ],
    [t, tc, session, canManage, canRoles, actions.setStatus],
  );

  const outlets = [...session.outlets.values()];

  return (
    <>
      <PageHeader
        breadcrumb={tn("setup")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          canManage && (
            <>
              <Button variant="outline" className="h-11 px-4" onClick={() => setOpen({ kind: "import" })}>
                <Upload /> {t("import")}
              </Button>
              <Button className="h-11 px-4 font-bold" onClick={() => setOpen({ kind: "user", user: null })}>
                <UserPlus /> {t("add")}
              </Button>
            </>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-11 bg-white pl-9"
          />
        </div>
        <Select value={outletId ?? NULL_OPTION} onValueChange={(v) => setOutletId(v === NULL_OPTION ? null : v)}>
          <SelectTrigger className="h-11 w-52 bg-white" aria-label={t("colOutlet")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NULL_OPTION}>{tc("allOutlets")}</SelectItem>
            {outlets.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="text-text-strong flex items-center gap-2 text-sm font-semibold">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          {t("showInactive")}
        </label>
      </div>

      <Section>
        {users.isPending ? (
          <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />
        ) : users.isError ? (
          <EmptyState>{friendlyError(users.error)}</EmptyState>
        ) : (
          <DataTable columns={columns} data={rows} minWidth={900} empty={t("empty")} />
        )}
      </Section>

      {open?.kind === "user" && <UserDialog user={open.user} actions={actions} onClose={() => setOpen(null)} />}
      {open?.kind === "roles" && <RolesDialog user={open.user} actions={actions} onClose={() => setOpen(null)} />}
      {open?.kind === "import" && <ImportDialog actions={actions} onClose={() => setOpen(null)} />}
      {open?.kind === "status" && (
        <AlertDialog open onOpenChange={(o) => !o && setOpen(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deactivateTitle", { name: open.user.full_name })}</AlertDialogTitle>
              <AlertDialogDescription>{t("deactivateBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() =>
                  actions.setStatus.mutate(
                    { id: open.user.id, status: "inactive" },
                    { onSuccess: () => toast.success(t("deactivated")) },
                  )
                }
              >
                {t("deactivate")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
