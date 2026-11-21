"use client";

import { ChevronLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { AsahMark } from "@/components/admin/logo";
import { useLocaleSwitch, useSupabase } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLIENT_NAME } from "@/lib/env";
import { friendlyError } from "@/lib/errors";
import { toE164 } from "@/lib/phone";
import { cn } from "@/lib/utils";

/** Phone number and one-time code (PRD F5). Accounts are created by HQ, never here. */
export default function SignInPage() {
  const t = useTranslations("signIn");
  const supabase = useSupabase();
  const router = useRouter();
  const { locale, setLocale } = useLocaleSwitch();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function sendCode() {
    if (phone.replace(/\D/g, "").length < 8) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone: toE164(phone), options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) {
      setError(/signups? not allowed|otp_disabled|not found/i.test(error.message) ? t("notRegistered") : friendlyError(error));
      return;
    }
    setStep("code");
    setResendIn(60);
  }

  async function verify() {
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone: toE164(phone), token: code, type: "sms" });
    if (error) {
      setBusy(false);
      setCode("");
      setError(t("wrongCode"));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="bg-primary hidden flex-col justify-between p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <AsahMark inverted className="size-11 rounded-xl" />
          <span className="text-[28px] font-extrabold tracking-[0.08em]">ASAH</span>
        </div>
        <div className="space-y-3">
          <p className="text-[34px] leading-tight font-bold whitespace-pre-line">{t("headline")}</p>
          <p className="text-[15px] text-[#cfe3dc]">{CLIENT_NAME}</p>
        </div>
      </section>

      <section className="flex flex-col p-6 sm:p-12">
        <div className="flex justify-end">
          <div role="group" aria-label="Language" className="bg-muted flex rounded-full p-1">
            {(["en", "id"] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={locale === l}
                onClick={() => setLocale(l)}
                className={cn(
                  "min-h-8 rounded-full px-3.5 text-[13px] font-bold uppercase",
                  locale === l ? "bg-primary text-white" : "text-muted-foreground",
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6">
          <div className="flex items-center gap-2.5 lg:hidden">
            <AsahMark />
            <span className="text-lg font-extrabold tracking-[0.06em]">ASAH Admin</span>
          </div>

          {step === "phone" ? (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void sendCode();
              }}
            >
              <div className="space-y-1.5">
                <h1 className="text-[22px] font-bold">{t("title")}</h1>
                <p className="text-muted-foreground text-sm">{t("sub")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-text-strong">
                  {t("phone")}
                </Label>
                <div className="border-input focus-within:border-primary flex h-14 items-center overflow-hidden rounded-[14px] border-[1.5px] bg-white">
                  <span className="bg-background text-text-strong flex h-full items-center border-r px-3.5 font-semibold">+62</span>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    autoFocus
                    placeholder="812 3456 7890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ""))}
                    className="h-full rounded-none border-0 text-[17px] shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
              {error && <p className="text-destructive text-sm font-semibold">{error}</p>}
              <Button type="submit" className="h-14 w-full rounded-[14px] text-base font-bold" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : t("sendCode")}
              </Button>
            </form>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError(null);
                }}
                className="text-primary -ml-1 flex min-h-11 items-center gap-1 text-sm font-semibold"
              >
                <ChevronLeft className="size-5" />
                {t("changeNumber")}
              </button>
              <div className="space-y-1.5">
                <h1 className="text-[22px] font-bold">{t("enterCode")}</h1>
                <p className="text-muted-foreground text-sm">{t("sentTo", { phone: toE164(phone) })}</p>
              </div>
              <Input
                aria-label={t("enterCode")}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(v);
                }}
                className="h-14 rounded-xl text-center text-2xl font-bold tracking-[0.6em]"
              />
              {error && <p className="text-destructive text-sm font-semibold">{error}</p>}
              {resendIn > 0 ? (
                <p className="text-muted-foreground text-[13px]">{t("resendIn", { seconds: resendIn })}</p>
              ) : (
                <button type="button" onClick={() => void sendCode()} className="text-primary text-sm font-bold">
                  {t("resend")}
                </button>
              )}
              <Button type="submit" className="h-14 w-full rounded-[14px] text-base font-bold" disabled={busy || code.length !== 6}>
                {busy ? <Loader2 className="animate-spin" /> : t("verify")}
              </Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
