import Papa from "papaparse";

/** Saves rows as a CSV file in the browser. A BOM makes Excel read UTF-8. */
export function downloadCsv(fileName: string, rows: (string | number | null)[][]) {
  const csv = "﻿" + Papa.unparse(rows);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
