"use client";

import { FileText, X } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { formatBytes } from "@/lib/repo-tree";

/**
 * PDF/PPTX picker shared by the document and repository modes.
 *
 * The native input is remounted when the mode panel changes, so the selected
 * file is rendered from state as well: switching modes never looks like the
 * upload was lost. Validation stays in the form's submit handler, as before.
 */

type DocumentFieldProps = {
  id: string;
  label: string;
  hint?: string;
  file: File | null;
  disabled: boolean;
  onChange: (file: File | null) => void;
};

const ACCEPT =
  ".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation";

export function DocumentField({
  id,
  label,
  hint,
  file,
  disabled,
  onChange,
}: DocumentFieldProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  function clear(): void {
    if (inputRef.current !== null) {
      inputRef.current.value = "";
    }
    onChange(null);
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <input
        accept={ACCEPT}
        className="block w-full max-w-sm cursor-pointer rounded-lg border border-border bg-background text-sm file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        id={id}
        onChange={(event) => {
          onChange(event.target.files?.[0] ?? null);
        }}
        ref={inputRef}
        type="file"
      />
      {file === null ? null : (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <FileText aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">
            {t("generate.form.file.selected", { name: file.name })}
          </span>
          <span className="tabular-nums">{formatBytes(file.size)}</span>
          <Button
            disabled={disabled}
            onClick={clear}
            size="xs"
            variant="ghost"
          >
            <X aria-hidden="true" />
            {t("generate.form.file.remove")}
          </Button>
        </p>
      )}
      {hint === undefined ? null : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
