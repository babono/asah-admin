"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DataTable, type AdminColumn } from "@/components/admin/data-table";
import { DialogActions } from "@/components/admin/dialog-actions";
import { FormInput, FormSelect } from "@/components/admin/form-fields";
import { IconButton } from "@/components/admin/icon-button";
import { EmptyState, PageHeader, Pill, Section } from "@/components/admin/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldDescription } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";

import { useNamed, useOutletActions, useOutletsAdmin, type Named, type NamedTable, type OutletRow } from "./api";

type Actions = ReturnType<typeof useOutletActions>;

const TIMEZONES = {
  "Asia/Jakarta": "WIB · Asia/Jakarta",
  "Asia/Makassar": "WITA · Asia/Makassar",
  "Asia/Jayapura": "WIT · Asia/Jayapura",
} as const;

/** Brands, areas and outlets with the location used for the on-site check (PRD F3). */
export function OutletsPage() {
  const t = useTranslations("outlets");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const outlets = useOutletsAdmin();
  const brands = useNamed("brands");
  const areas = useNamed("areas");
  const actions = useOutletActions({ saved: tc("saved"), archived: tc("archivedDone"), restored: tc("restoredDone") });
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<OutletRow | "new" | null>(null);
  const [naming, setNaming] = useState<{ table: NamedTable; row: Named | null } | null>(null);

  const activeBrands = (brands.data ?? []).filter((b) => !b.archived_at);
  const activeAreas = (areas.data ?? []).filter((a) => !a.archived_at);
  const canAddOutlet = activeBrands.length > 0 && activeAreas.length > 0;

  const columns = useMemo<AdminColumn<OutletRow>[]>(
    () => [
      {
        id: "name",
        header: t("colOutlet"),
        accessorFn: (o) => o.name,
        cell: ({ row }) => (
          <span className={cn("font-bold", row.original.archived_at && "text-muted-foreground")}>{row.original.name}</span>
        ),
      },
      { id: "brand", header: t("colBrand"), accessorFn: (o) => o.brands?.name ?? "" },
      { id: "area", header: t("colArea"), accessorFn: (o) => o.areas?.name ?? "" },
      {
        id: "location",
        header: t("colLocation"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.latitude == null ? (
            <Pill tone="danger">{t("noLocation")}</Pill>
          ) : (
            <span className="tabular-nums">
              {row.original.latitude}, {row.original.longitude}
            </span>
          ),
      },
      {
        id: "radius",
        header: t("colRadius"),
        accessorFn: (o) => o.geofence_radius_m,
        cell: ({ row }) => t("radiusValue", { metres: row.original.geofence_radius_m }),
      },
      {
        id: "tz",
        header: t("colTimezone"),
        enableSorting: false,
        cell: ({ row }) => TIMEZONES[row.original.timezone as keyof typeof TIMEZONES]?.split(" ")[0] ?? row.original.timezone,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <IconButton
              label={row.original.archived_at ? tc("restore") : tc("archive")}
              onClick={() => actions.archiveOutlet.mutate({ id: row.original.id, archived: Boolean(row.original.archived_at) })}
            >
              {row.original.archived_at ? <ArchiveRestore /> : <Archive />}
            </IconButton>
          </div>
        ),
      },
    ],
    [t, tc, actions.archiveOutlet],
  );

  const rows = useMemo(() => (outlets.data ?? []).filter((o) => showArchived || !o.archived_at), [outlets.data, showArchived]);

  return (
    <>
      <PageHeader
        breadcrumb={tn("setup")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <label className="text-text-strong flex items-center gap-2 text-sm font-semibold">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
              {tc("showArchived")}
            </label>
            <Button className="h-11 px-4 font-bold" disabled={!canAddOutlet} onClick={() => setEditing("new")}>
              <Plus /> {t("newOutlet")}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <NamedChips
          title={t("brands")}
          add={t("addBrand")}
          items={brands.data}
          showArchived={showArchived}
          onEdit={(row) => setNaming({ table: "brands", row })}
          onArchive={(row) => actions.archiveNamed.mutate({ table: "brands", id: row.id, archived: Boolean(row.archived_at) })}
        />
        <NamedChips
          title={t("areas")}
          add={t("addArea")}
          items={areas.data}
          showArchived={showArchived}
          onEdit={(row) => setNaming({ table: "areas", row })}
          onArchive={(row) => actions.archiveNamed.mutate({ table: "areas", id: row.id, archived: Boolean(row.archived_at) })}
        />
      </div>

      <Section title={t("title")}>
        {!canAddOutlet && !brands.isPending && !areas.isPending && (
          <p className="text-muted-foreground mb-3 text-sm">{t("needBrandArea")}</p>
        )}
        {outlets.isPending ? (
          <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />
        ) : outlets.isError ? (
          <EmptyState>{friendlyError(outlets.error)}</EmptyState>
        ) : (
          <DataTable columns={columns} data={rows} minWidth={860} empty={t("empty")} onRowClick={(o) => setEditing(o)} />
        )}
      </Section>

      {naming && <NamedDialog table={naming.table} row={naming.row} actions={actions} onClose={() => setNaming(null)} />}
      {editing && (
        <OutletDialog
          outlet={editing === "new" ? null : editing}
          brands={activeBrands}
          areas={activeAreas}
          actions={actions}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function NamedChips({
  title,
  add,
  items,
  showArchived,
  onEdit,
  onArchive,
}: {
  title: string;
  add: string;
  items: Named[] | undefined;
  showArchived: boolean;
  onEdit: (row: Named | null) => void;
  onArchive: (row: Named) => void;
}) {
  const tc = useTranslations("common");
  return (
    <Section title={title}>
      <div className="flex flex-wrap gap-2">
        {(items ?? [])
          .filter((n) => showArchived || !n.archived_at)
          .map((n) => (
            <span
              key={n.id}
              className={cn(
                "flex items-center rounded-full border-[1.5px] pl-3 text-[13px] font-bold",
                n.archived_at ? "border-input text-muted-foreground" : "border-primary bg-secondary text-primary",
              )}
            >
              <button type="button" onClick={() => onEdit(n)} className="py-1.5">
                {n.name}
              </button>
              <button
                type="button"
                aria-label={`${n.archived_at ? tc("restore") : tc("archive")} ${n.name}`}
                title={n.archived_at ? tc("restore") : tc("archive")}
                onClick={() => onArchive(n)}
                className="hover:bg-background ml-1 rounded-full p-1.5"
              >
                {n.archived_at ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
              </button>
            </span>
          ))}
        <button
          type="button"
          onClick={() => onEdit(null)}
          className="text-text-strong min-h-9 rounded-full border-[1.5px] border-dashed border-[#a9aea9] px-3 text-[13px] font-semibold"
        >
          + {add}
        </button>
      </div>
    </Section>
  );
}

function NamedDialog({ table, row, actions, onClose }: { table: NamedTable; row: Named | null; actions: Actions; onClose: () => void }) {
  const t = useTranslations("outlets");
  const tc = useTranslations("common");
  const schema = z.object({ name: z.string().trim().min(1) });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { name: row?.name ?? "" } });
  const title = table === "brands" ? (row ? t("editBrand") : t("newBrand")) : row ? t("editArea") : t("newArea");
  const submit = form.handleSubmit(async (v) => {
    await actions.saveNamed.mutateAsync({ table, id: row?.id, name: v.name });
    onClose();
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="name" label={t("name")} autoFocus />
          <DialogActions busy={actions.saveNamed.isPending} onCancel={onClose} save={tc("save")} cancel={tc("cancel")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OutletDialog({
  outlet,
  brands,
  areas,
  actions,
  onClose,
}: {
  outlet: OutletRow | null;
  brands: Named[];
  areas: Named[];
  actions: Actions;
  onClose: () => void;
}) {
  const t = useTranslations("outlets");
  const tc = useTranslations("common");
  const coord = (min: number, max: number, message: string) =>
    z.string().trim().refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max), message);
  const schema = z
    .object({
      name: z.string().trim().min(1),
      brand_id: z.string().min(1),
      area_id: z.string().min(1),
      address: z.string().trim(),
      latitude: coord(-90, 90, t("latRange")),
      longitude: coord(-180, 180, t("lngRange")),
      geofence_radius_m: z.coerce.number<string>().int().min(10, t("radiusRange")).max(5000, t("radiusRange")),
      timezone: z.enum(Object.keys(TIMEZONES) as [keyof typeof TIMEZONES, ...(keyof typeof TIMEZONES)[]]),
    })
    .refine((v) => (v.latitude === "") === (v.longitude === ""), { path: ["longitude"], message: t("bothOrNone") });

  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: outlet?.name ?? "",
      brand_id: outlet?.brand_id ?? brands[0]?.id ?? "",
      area_id: outlet?.area_id ?? areas[0]?.id ?? "",
      address: outlet?.address ?? "",
      latitude: outlet?.latitude?.toString() ?? "",
      longitude: outlet?.longitude?.toString() ?? "",
      geofence_radius_m: String(outlet?.geofence_radius_m ?? 150),
      timezone: (outlet?.timezone as keyof typeof TIMEZONES) ?? "Asia/Makassar",
    },
  });

  const submit = form.handleSubmit(async (v) => {
    await actions.saveOutlet.mutateAsync({
      id: outlet?.id,
      values: {
        ...v,
        address: v.address || null,
        latitude: v.latitude === "" ? null : Number(v.latitude),
        longitude: v.longitude === "" ? null : Number(v.longitude),
      },
    });
    onClose();
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{outlet ? t("editOutlet") : t("newOutlet")}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="name" label={t("name")} autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <FormSelect control={form.control} name="brand_id" label={t("brand")} options={brands.map((b) => ({ value: b.id, label: b.name }))} />
            <FormSelect control={form.control} name="area_id" label={t("area")} options={areas.map((a) => ({ value: a.id, label: a.name }))} />
          </div>
          <FormInput control={form.control} name="address" label={t("address")} />
          <div className="grid grid-cols-2 gap-3">
            <FormInput control={form.control} name="latitude" label={t("latitude")} inputMode="decimal" placeholder="-8.650000" />
            <FormInput control={form.control} name="longitude" label={t("longitude")} inputMode="decimal" placeholder="115.216000" />
          </div>
          <FieldDescription>{t("locationHint")}</FieldDescription>
          <div className="grid grid-cols-2 gap-3">
            <FormInput control={form.control} name="geofence_radius_m" label={t("radius")} type="number" min={10} max={5000} />
            <FormSelect
              control={form.control}
              name="timezone"
              label={t("timezone")}
              options={Object.entries(TIMEZONES).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <DialogActions busy={actions.saveOutlet.isPending} onCancel={onClose} save={tc("save")} cancel={tc("cancel")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
