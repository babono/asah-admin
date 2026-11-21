import { cn } from "@/lib/utils";

/** The ASAH mark: an "A" on a rounded tile. */
export function AsahMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <div
      className={cn(
        "flex size-8 items-center justify-center rounded-[9px]",
        inverted ? "bg-brand-amber" : "bg-primary",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[55%]" fill="none" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 20 12 4l7 16" className={inverted ? "stroke-primary" : "stroke-brand-amber"} />
        <path d="M8 13h8" className={inverted ? "stroke-primary" : "stroke-brand-amber"} />
      </svg>
    </div>
  );
}
