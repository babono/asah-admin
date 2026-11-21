"use client";

import type { ReactNode } from "react";
import { useController, type Control, type FieldPath, type FieldValues } from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * react-hook-form + shadcn Field bindings. Validation lives in the zod
 * schema given to zodResolver; these only render the value and its error.
 */
type Base<T extends FieldValues> = {
  // Any context and output type, so forms whose zod schema transforms values
  // (e.g. a number typed as text) can use these fields too.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: ReactNode;
  description?: ReactNode;
  className?: string;
};

export function FormInput<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  ...input
}: Base<T> & Omit<React.ComponentProps<typeof Input>, "name" | "value" | "onChange" | "onBlur">) {
  const { field, fieldState } = useController({ control, name });
  return (
    <Field className={className} data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} aria-invalid={fieldState.invalid} className="h-11" {...input} {...field} value={field.value ?? ""} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={[fieldState.error]} />
    </Field>
  );
}

export function FormTextarea<T extends FieldValues>({ control, name, label, description, className, rows = 3 }: Base<T> & { rows?: number }) {
  const { field, fieldState } = useController({ control, name });
  return (
    <Field className={className} data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Textarea id={name} rows={rows} aria-invalid={fieldState.invalid} {...field} value={field.value ?? ""} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={[fieldState.error]} />
    </Field>
  );
}

/**
 * Radix Select cannot hold an empty value, so null maps to NULL_OPTION.
 */
export const NULL_OPTION = "__none__";

export function FormSelect<T extends FieldValues>({
  control,
  name,
  label,
  description,
  className,
  options,
}: Base<T> & { options: { value: string | null; label: ReactNode }[] }) {
  const { field, fieldState } = useController({ control, name });
  return (
    <Field className={className} data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Select value={field.value ?? NULL_OPTION} onValueChange={(v) => field.onChange(v === NULL_OPTION ? null : v)}>
        <SelectTrigger id={name} className="h-11 w-full" aria-invalid={fieldState.invalid}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value ?? NULL_OPTION} value={o.value ?? NULL_OPTION}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={[fieldState.error]} />
    </Field>
  );
}

export function FormCheckbox<T extends FieldValues>({ control, name, label, className }: Base<T>) {
  const { field } = useController({ control, name });
  return (
    <Field orientation="horizontal" className={className}>
      <Checkbox id={name} checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} />
      <FieldLabel htmlFor={name} className="font-normal">
        {label}
      </FieldLabel>
    </Field>
  );
}
