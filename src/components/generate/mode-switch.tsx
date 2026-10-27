"use client";

import { FileText, FolderGit2, Type } from "lucide-react";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Mode selector for the generate form.
 *
 * Native radios (visually hidden) inside labels: keyboard arrow navigation and
 * screen-reader semantics come for free, and the styling matches the existing
 * muted segmented control used by the tabs primitive.
 */

export type GenerationMode = "topic" | "document" | "repo";

const MODES = [
  { value: "topic", labelKey: "generate.mode.topic", Icon: Type },
  { value: "document", labelKey: "generate.mode.document", Icon: FileText },
  { value: "repo", labelKey: "generate.mode.repo", Icon: FolderGit2 },
] as const;

type ModeSwitchProps = {
  value: GenerationMode;
  onChange: (mode: GenerationMode) => void;
  disabled: boolean;
};

export function ModeSwitch({ value, onChange, disabled }: ModeSwitchProps) {
  const t = useT();

  return (
    <div
      aria-label={t("generate.mode.label")}
      className="flex flex-col gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground sm:inline-flex sm:w-fit sm:flex-row"
      role="radiogroup"
    >
      {MODES.map(({ value: mode, labelKey, Icon }) => {
        const checked = value === mode;

        return (
          <label
            className={cn(
              "flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
              "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              checked
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground/60 hover:text-foreground",
              disabled ? "cursor-not-allowed opacity-50" : "",
            )}
            key={mode}
          >
            <input
              checked={checked}
              className="sr-only"
              disabled={disabled}
              name="generation-mode"
              onChange={() => {
                onChange(mode);
              }}
              type="radio"
              value={mode}
            />
            <Icon aria-hidden="true" className="size-4" />
            {t(labelKey)}
          </label>
        );
      })}
    </div>
  );
}
