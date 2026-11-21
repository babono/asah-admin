"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DialogActions } from "@/components/admin/dialog-actions";
import { FormInput, FormSelect } from "@/components/admin/form-fields";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldDescription } from "@/components/ui/field";
import { usePositions } from "@/features/org/api";
import { isPlausiblePhone, toE164 } from "@/lib/phone";
import { useRequiredSession } from "@/lib/session";

import type { UserRow, useUserActions } from "./api";

/** Create a user (via asah-be's admin-users) or edit their job details. */
export function UserDialog({
  user,
  actions,
  onClose,
}: {
  user: UserRow | null;
  actions: ReturnType<typeof useUserActions>;
  onClose: () => void;
}) {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const session = useRequiredSession();
  const positions = usePositions();
  const creating = user === null;

  const schema = z.object({
    full_name: z.string().trim().min(1),
    // Only asked when creating: the phone is the login, kept in sync by Auth.
    phone: creating ? z.string().refine(isPlausiblePhone, t("phoneInvalid")) : z.string(),
    outlet_id: z.string().nullable(),
    position_id: z.string().nullable(),
    hire_date: z.string(),
    locale: z.enum(["id", "en"]),
  });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: user?.full_name ?? "",
      phone: "",
      outlet_id: user?.outlet_id ?? null,
      position_id: user?.position_id ?? null,
      hire_date: user?.hire_date ?? new Date().toISOString().slice(0, 10),
      locale: (user?.locale as "id" | "en") ?? "id",
    },
  });

  const submit = form.handleSubmit(async (v) => {
    const common = {
      full_name: v.full_name,
      outlet_id: v.outlet_id,
      position_id: v.position_id,
      hire_date: v.hire_date || null,
      locale: v.locale,
    };
    if (creating) {
      const [result] = await actions.createUsers.mutateAsync([{ ...common, phone: toE164(v.phone) }]);
      if (!result?.ok) {
        form.setError("phone", { message: result?.error ?? "Failed" });
        return;
      }
      toast.success(t("created"));
    } else {
      await actions.updateProfile.mutateAsync({ id: user.id, ...common });
    }
    onClose();
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{creating ? t("addTitle") : t("editTitle", { name: user.full_name })}</DialogTitle>
          </DialogHeader>
          <FormInput control={form.control} name="full_name" label={t("fullName")} autoFocus />
          {creating && (
            <FormInput control={form.control} name="phone" label={t("phone")} type="tel" placeholder={t("phonePlaceholder")} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormSelect
              control={form.control}
              name="outlet_id"
              label={t("outlet")}
              options={[
                { value: null, label: t("noOutlet") },
                ...[...session.outlets.values()].map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
            <FormSelect
              control={form.control}
              name="position_id"
              label={t("position")}
              options={[
                { value: null, label: t("noPosition") },
                ...(positions.data ?? []).map((p) => ({
                  value: p.id,
                  label: `${p.departments?.name ?? ""} · ${p.name} (L${p.level})`,
                })),
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormInput control={form.control} name="hire_date" label={t("firstDay")} type="date" />
            <FormSelect
              control={form.control}
              name="locale"
              label={t("language")}
              options={[
                { value: "id", label: "Bahasa Indonesia" },
                { value: "en", label: "English" },
              ]}
            />
          </div>
          <FieldDescription>{creating ? t("createHint") : t("editHint")}</FieldDescription>
          <DialogActions
            busy={actions.createUsers.isPending || actions.updateProfile.isPending}
            onCancel={onClose}
            save={creating ? tc("create") : tc("save")}
            cancel={tc("cancel")}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
