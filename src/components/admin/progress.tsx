/** Thin rounded progress bar, as in the design. */
export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className={`bg-muted h-2 overflow-hidden rounded-full ${className ?? ""}`}
    >
      <div className="bg-primary h-full transition-[width]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
