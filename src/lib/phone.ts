/**
 * Indonesian numbers in any common form ("0812…", "62812…", "+62 812…") to
 * E.164. Same rule as asah-be's admin-users function and the phone app.
 */
export function toE164(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return `+${trimmed.replace(/\D/g, "")}`;
  let d = trimmed.replace(/\D/g, "");
  if (d.startsWith("62")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return `+62${d}`;
}

export const isPlausiblePhone = (raw: string) => toE164(raw).length >= 11;
