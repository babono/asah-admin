"use client";

import {
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Features every admin table registers (TanStack Table v9). Module scope keeps them stable. */
export const adminTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime },
});
export type AdminColumn<T extends RowData> = ColumnDef<typeof adminTableFeatures, T, unknown>;

/**
 * Table with the design's header style. Columns are sortable unless they set
 * `enableSorting: false`; rows are clickable when onRowClick is given.
 * Pass `columns` from module scope or useMemo so the row model stays cached.
 */
export function DataTable<T extends RowData>({
  columns,
  data,
  onRowClick,
  empty,
  minWidth = 640,
}: {
  columns: AdminColumn<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  minWidth?: number;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useTable({
    features: adminTableFeatures,
    columns,
    data,
    state: { sorting },
    onSortingChange: setSorting,
  });

  const rows = table.getRowModel().rows;
  return (
    <div className="overflow-x-auto">
      <Table style={{ minWidth }}>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => (
                <TableHead key={header.id} className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button type="button" className="inline-flex items-center gap-1 uppercase" onClick={header.column.getToggleSortingHandler()}>
                      <table.FlexRender header={header} />
                      <ArrowUpDown className="size-3" />
                    </button>
                  ) : (
                    <table.FlexRender header={header} />
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-muted-foreground py-8 text-center">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn("h-13", onRowClick && "cursor-pointer")}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
