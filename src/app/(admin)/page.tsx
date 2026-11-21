"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { visibleNav } from "@/components/admin/nav";
import { PageHeader, Pill } from "@/components/admin/page";
import { useRequiredSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const t = useTranslations();
  const session = useRequiredSession();
  const items = visibleNav(session).filter((i) => i.href !== "/");
  return (
    <>
      <PageHeader title={t("home.title", { name: session.profile.fullName })} subtitle={t("home.subtitle")} />
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          const card = (
            <div
              className={cn(
                "bg-card flex items-center gap-3 rounded-2xl border p-[18px]",
                item.built ? "hover:border-primary transition-colors" : "opacity-60",
              )}
            >
              <div className="bg-secondary text-primary flex size-11 items-center justify-center rounded-xl">
                <Icon className="size-5" />
              </div>
              <span className="flex-1 font-bold">{t(`nav.${item.key}`)}</span>
              {!item.built && <Pill tone="neutral">{t("common.soon")}</Pill>}
            </div>
          );
          return item.built ? (
            <Link key={item.href} href={item.href}>
              {card}
            </Link>
          ) : (
            <div key={item.href}>{card}</div>
          );
        })}
      </div>
    </>
  );
}
