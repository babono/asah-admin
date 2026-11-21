import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Page frame: breadcrumb, title, actions, content. */
export function PageHeader({
  breadcrumb,
  title,
  subtitle,
  actions,
}: {
  breadcrumb?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        {breadcrumb && <div className="text-muted-foreground text-[13px] font-semibold">{breadcrumb}</div>}
        <h1 className="text-[28px] leading-tight font-extrabold">{title}</h1>
        {subtitle && <p className="text-muted-foreground max-w-3xl text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/** White rounded section, as in the design. */
export function Section({
  title,
  trailing,
  children,
  className,
}: {
  title?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-card mb-5 rounded-[18px] border p-6", className)}>
      {(title || trailing) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-[17px] font-bold">{title}</h2>}
          {trailing}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = "primary" | "warning" | "danger" | "info" | "neutral";

const tones: Record<Tone, string> = {
  primary: "bg-secondary text-primary",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-destructive",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
};

/** Small status label ("Published", "Required"). */
export function Pill({ tone = "primary", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="bg-muted text-text-strong rounded-2xl px-4 py-5 text-sm">{children}</div>;
}
