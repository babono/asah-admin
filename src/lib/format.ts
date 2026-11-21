export const fmtDate = (iso: string | null | undefined, locale = "en") =>
  iso ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "–";

export const fmtTime = (hhmmss: string) => hhmmss.slice(0, 5);
