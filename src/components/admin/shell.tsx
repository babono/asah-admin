"use client";

import { Loader2, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { AsahMark } from "@/components/admin/logo";
import { visibleNav, type NavItem } from "@/components/admin/nav";
import { Pill } from "@/components/admin/page";
import { useLocaleSwitch, useSupabase } from "@/components/providers";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CLIENT_NAME } from "@/lib/env";
import { friendlyError } from "@/lib/errors";
import { NoProfileError, useSession, type Session } from "@/lib/session";
import { cn } from "@/lib/utils";

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (session.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="text-primary size-8 animate-spin" />
      </div>
    );
  }
  if (session.isError) {
    return (
      <CenteredMessage title={session.error instanceof NoProfileError ? t("shell.noProfile") : friendlyError(session.error)}>
        <Button variant="outline" onClick={() => session.refetch()}>
          {t("common.retry")}
        </Button>
        <SignOutButton />
      </CenteredMessage>
    );
  }

  const s = session.data;
  const items = visibleNav(s);
  if (items.length <= 1) {
    return (
      <CenteredMessage title={t("shell.noAccessTitle")} body={t("shell.noAccessBody")}>
        <SignOutButton />
      </CenteredMessage>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header session={s} onMenu={() => setMenuOpen(true)} />
      <div className="flex flex-1">
        <aside className="bg-sidebar hidden w-60 shrink-0 border-r lg:block">
          <Sidebar items={items} />
        </aside>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Sidebar items={items} onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        <main className="min-w-0 flex-1 px-4 py-7 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

function Header({ session, onMenu }: { session: Session; onMenu: () => void }) {
  const t = useTranslations("common");
  const { locale, setLocale } = useLocaleSwitch();
  return (
    <header className="bg-card flex h-15 items-center gap-3 border-b px-4 sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Menu">
        <Menu />
      </Button>
      <AsahMark />
      <span className="text-base font-extrabold tracking-[0.04em]">ASAH Admin</span>
      <Pill className="hidden sm:inline-flex">{session.roleLabel}</Pill>
      <div className="flex-1" />
      <span className="text-muted-foreground hidden text-[13px] font-semibold md:block">{CLIENT_NAME}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="bg-brand-amber text-brand-amber-foreground flex size-9 items-center justify-center rounded-full text-sm font-extrabold"
            aria-label={session.profile.fullName}
          >
            {session.profile.fullName.trim().charAt(0).toUpperCase()}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{session.profile.fullName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted-foreground text-xs">{t("language")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as "en" | "id")}>
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="id">Bahasa Indonesia</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <SignOutMenuItem />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function Sidebar({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const t = useTranslations();
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav aria-label="Admin" className="flex flex-col gap-0.5 px-3 py-5">
      {items.map((item, i) => {
        const header =
          item.section && item.section !== items[i - 1]?.section ? (
            <p className="text-muted-foreground mt-4 mb-1.5 px-3 text-[11px] font-bold tracking-[0.08em] uppercase first:mt-0">
              {t(`nav.${item.section}`)}
            </p>
          ) : null;
        const Icon = item.icon;
        const className = cn(
          "flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-semibold",
          active(item.href) ? "bg-sidebar-accent text-primary font-bold" : "text-text-strong",
          item.built ? "hover:bg-muted" : "cursor-default opacity-60",
        );
        const content = (
          <>
            <Icon className="size-[18px]" />
            <span className="flex-1">{t(`nav.${item.key}`)}</span>
            {!item.built && <Pill tone="neutral" className="text-[10px]">{t("common.soon")}</Pill>}
          </>
        );
        return (
          <div key={item.href}>
            {header}
            {item.built ? (
              <Link href={item.href} onClick={onNavigate} className={className} aria-current={active(item.href) ? "page" : undefined}>
                {content}
              </Link>
            ) : (
              <span className={className} aria-disabled="true">
                {content}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function useSignOut() {
  const supabase = useSupabase();
  const router = useRouter();
  return async () => {
    await supabase.auth.signOut();
    router.replace("/sign-in");
    router.refresh();
  };
}

function SignOutButton() {
  const t = useTranslations("common");
  const signOut = useSignOut();
  return (
    <Button variant="outline" onClick={signOut}>
      <LogOut /> {t("signOut")}
    </Button>
  );
}

function SignOutMenuItem() {
  const t = useTranslations("common");
  const signOut = useSignOut();
  return (
    <DropdownMenuItem onSelect={signOut}>
      <LogOut /> {t("signOut")}
    </DropdownMenuItem>
  );
}

function CenteredMessage({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md space-y-3 text-center">
        <AsahMark className="mx-auto size-11 rounded-xl" />
        <h1 className="text-lg font-bold">{title}</h1>
        {body && <p className="text-muted-foreground text-sm">{body}</p>}
        <div className="flex justify-center gap-2 pt-2">{children}</div>
      </div>
    </div>
  );
}
