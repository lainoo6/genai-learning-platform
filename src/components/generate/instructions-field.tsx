"use client";

import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/client";
import { MAX_INSTRUCTIONS_CHARS } from "@/lib/course-source";

/**
 * Optional free-text guidance shared by the document and repository modes.
 *
 * The value lives in the form, so switching modes never clears it.
 */

type InstructionsFieldProps = {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

export function InstructionsField({
  id,
  value,
  disabled,
  onChange,
}: InstructionsFieldProps) {
  const t = useT();

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={id}>
        {t("generate.form.instructions.label")}{" "}
        <span className="font-normal text-muted-foreground">
          {t("generate.form.optional")}
        </span>
      </label>
      <Textarea
        disabled={disabled}
        id={id}
        maxLength={MAX_INSTRUCTIONS_CHARS}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={t("generate.form.instructions.placeholder")}
        rows={2}
        value={value}
      />
      <p className="text-xs text-muted-foreground">
        {t("generate.form.instructions.hint")}
      </p>
    </div>
  );
}
