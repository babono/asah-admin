"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createClient, type Supabase } from "@/lib/supabase/client";
import en from "@/messages/en.json";
import id from "@/messages/id.json";

export type Locale = "en" | "id";
const messages = { en, id } as const;
const LOCALE_KEY = "asah.locale";
const LOCALE_EVENT = "asah:locale";

/** The saved language lives in localStorage; the server always renders English. */
const localeStore = {
  subscribe(onChange: () => void) {
    window.addEventListener(LOCALE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(LOCALE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  },
  get(): Locale {
    const saved = window.localStorage.getItem(LOCALE_KEY);
    return saved === "id" ? "id" : "en";
  },
  set(l: Locale) {
    window.localStorage.setItem(LOCALE_KEY, l);
    document.documentElement.lang = l;
    window.dispatchEvent(new Event(LOCALE_EVENT));
  },
};

const SupabaseContext = createContext<Supabase | null>(null);
const LocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void } | null>(null);

export function useSupabase(): Supabase {
  const client = useContext(SupabaseContext);
  if (!client) throw new Error("useSupabase outside <Providers>");
  return client;
}

export function useLocaleSwitch() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocaleSwitch outside <Providers>");
  return ctx;
}

export function Providers({ children }: { children: ReactNode }) {
  const [supabase] = useState(createClient);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  // PRD F8: English and Bahasa Indonesia, chosen per browser.
  const locale = useSyncExternalStore(localeStore.subscribe, localeStore.get, () => "en" as const);
  const localeValue = useMemo(() => ({ locale, setLocale: localeStore.set }), [locale]);

  // Sign-out anywhere (or token expiry) drops cached data.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [supabase, queryClient]);

  return (
    <SupabaseContext value={supabase}>
      <LocaleContext value={localeValue}>
        <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Asia/Makassar">
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              {children}
              <Toaster richColors position="top-right" />
            </TooltipProvider>
          </QueryClientProvider>
        </NextIntlClientProvider>
      </LocaleContext>
    </SupabaseContext>
  );
}
