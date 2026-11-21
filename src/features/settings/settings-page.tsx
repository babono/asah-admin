"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm, useController, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormInput } from "@/components/admin/form-fields";
import { EmptyState, PageHeader, Section } from "@/components/admin/page";
import { useSupabase } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { Json } from "@/lib/database.types";
import { friendlyError, unwrap } from "@/lib/errors";

const int = (min: number, max: number) => z.coerce.number<string>().int().min(min).max(max);
const schema = z.object({
  min_level: int(1, 20),
  max_trainees: int(1, 20),
  require_path_complete: z.boolean(),
  rating_min_count: int(1, 50),
  certificate_reminder_days: int(1, 365),
  require_geofence: z.boolean(),
});
type In = z.input<typeof schema>;
type Out = z.output<typeof schema>;

/**
 * System rules read by asah-be (app_settings): mentor eligibility (M1),
 * rating privacy (M7), certificate reminders (T8), on-site check (A3).
 */
export function SettingsPage() {
  const t = useTranslations("settings");
  const tn = useTranslations("nav");
  const supabase = useSupabase();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => new Map(unwrap(await supabase.from("app_settings").select("key, value")).map((r) => [r.key, r.value])),
  });
  return (
    <>
      <PageHeader breadcrumb={tn("system")} title={t("title")} subtitle={t("subtitle")} />
      {settings.isPending ? (
        <Loader2 className="text-primary mx-auto my-8 size-6 animate-spin" />
      ) : settings.isError ? (
        <EmptyState>{friendlyError(settings.error)}</EmptyState>
      ) : (
        <SettingsForm values={settings.data} />
      )}
    </>
  );
}

function SettingsForm({ values }: { values: Map<string, Json> }) {
  const t = useTranslations("settings");
  const supabase = useSupabase();
  const qc = useQueryClient();
  const rules = (values.get("mentor_rules") ?? {}) as { min_level?: number; max_trainees?: number; require_path_complete?: boolean };
  const num = (k: string, fallback: number) => String(typeof values.get(k) === "number" ? values.get(k) : fallback);

  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(schema),
    defaultValues: {
      min_level: String(rules.min_level ?? 2),
      max_trainees: String(rules.max_trainees ?? 3),
      require_path_complete: rules.require_path_complete ?? true,
      rating_min_count: num("rating_min_count", 3),
      certificate_reminder_days: num("certificate_reminder_days", 30),
      require_geofence: values.get("require_geofence") !== false,
    },
  });

  const save = useMutation({
    mutationFn: async (v: Out) =>
      unwrap(
        await supabase.from("app_settings").upsert([
          { key: "mentor_rules", value: { min_level: v.min_level, max_trainees: v.max_trainees, require_path_complete: v.require_path_complete } },
          { key: "rating_min_count", value: v.rating_min_count },
          { key: "certificate_reminder_days", value: v.certificate_reminder_days },
          { key: "require_geofence", value: v.require_geofence },
        ]),
      ),
    onSuccess: () => {
      toast.success(t("saved"));
      form.reset(form.getValues());
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))}>
      <Section title={t("mentors")}>
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput control={form.control} name="min_level" label={t("minLevel")} type="number" min={1} />
          <FormInput control={form.control} name="max_trainees" label={t("maxTrainees")} type="number" min={1} />
          <FormInput control={form.control} name="rating_min_count" label={t("ratingMin")} type="number" min={1} />
          <SwitchField control={form.control} name="require_path_complete" label={t("pathComplete")} />
        </div>
      </Section>
      <Section title={t("training")}>
        <FormInput control={form.control} name="certificate_reminder_days" label={t("certDays")} type="number" min={1} className="max-w-md" />
      </Section>
      <Section title={t("checklists")}>
        <SwitchField control={form.control} name="require_geofence" label={t("geofence")} hint={t("geofenceHint")} />
      </Section>
      <Button type="submit" className="h-11 px-5 font-bold" disabled={!form.formState.isDirty || save.isPending}>
        {save.isPending && <Loader2 className="animate-spin" />}
        {t("save")}
      </Button>
    </form>
  );
}

function SwitchField({ control, name, label, hint }: { control: Control<In, unknown, Out>; name: "require_path_complete" | "require_geofence"; label: string; hint?: string }) {
  const { field } = useController({ control, name });
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-3 text-sm font-medium">
        <Switch checked={field.value} onCheckedChange={field.onChange} />
        {label}
      </label>
      {hint && <FieldDescription className="ml-12">{hint}</FieldDescription>}
    </div>
  );
}
