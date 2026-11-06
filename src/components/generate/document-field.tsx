"use client";

import { FileText, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import {
  COURSE_FILE_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
  courseFileKind,
  isImageName,
  uploadTotalBytes,
} from "@/lib/course-file";
import { formatBytes } from "@/lib/repo-tree";
import { cn } from "@/lib/utils";

/**
 * Document/PDF picker with a drop zone, shared by the document and repository
 * modes.
 *
 * The native input is remounted when the mode panel changes, so the selection
 * is rendered from state as well: switching modes never looks like the upload
 * was lost. Images are optional — a caller that omits `onImagesChange` keeps a
 * document-only field and every dropped image is rejected with a message.
 */

type DocumentFieldProps = {
  id: string;
  label: string;
  hint?: string;
  file: File | null;
  disabled: boolean;
  onChange: (file: File | null) => void;
  /** Dropped images, in the order they were added. */
  images?: File[];
  onImagesChange?: (images: File[]) => void;
};

const ACCEPT = [
  ...COURSE_FILE_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/webp",
].join(",");

export function DocumentField({
  id,
  label,
  hint,
  file,
  disabled,
  onChange,
  images,
  onImagesChange,
}: DocumentFieldProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearDocument(): void {
    if (inputRef.current !== null) {
      inputRef.current.value = "";
    }
    onChange(null);
  }

  /**
   * Splits a pick or a drop into the document slot and the image list.
   *
   * Nothing is dropped silently: every rejected file sets a message, and the
   * files that did pass are still applied.
   */
  function addFiles(candidates: File[]): void {
    if (disabled || candidates.length === 0) {
      return;
    }

    const current = images ?? [];
    let nextDocument = file;
    const nextImages = [...current];
    let nextError: string | null = null;

    for (const candidate of candidates) {
      if (isImageName(candidate.name)) {
        if (onImagesChange === undefined) {
          nextError = t("generate.form.images.unsupported", {
            name: candidate.name,
          });
          continue;
        }
        // Count first, then the individual file, then the shared budget, so the
        // message always names the file that could not be added.
        if (nextImages.length >= MAX_IMAGES) {
          nextError = t("generate.form.images.limit", { count: MAX_IMAGES });
          continue;
        }
        if (candidate.size > MAX_IMAGE_BYTES) {
          nextError = t("generate.form.images.tooLarge", {
            name: candidate.name,
          });
          continue;
        }
        if (
          uploadTotalBytes(nextDocument, [...nextImages, candidate]) >
          MAX_UPLOAD_BYTES
        ) {
          nextError = t("generate.form.images.totalTooLarge", {
            limit: formatBytes(MAX_UPLOAD_BYTES),
          });
          continue;
        }
        nextImages.push(candidate);
        continue;
      }

      if (courseFileKind(candidate.name) === null) {
        nextError = t("generate.form.images.unsupported", {
          name: candidate.name,
        });
        continue;
      }

      // The document slot holds one file; a later pick replaces it.
      nextDocument = candidate;
    }

    // Replacing the document can push an already accepted batch over the cap.
    if (
      nextError === null &&
      uploadTotalBytes(nextDocument, nextImages) > MAX_UPLOAD_BYTES
    ) {
      nextError = t("generate.form.images.totalTooLarge", {
        limit: formatBytes(MAX_UPLOAD_BYTES),
      });
    }

    setError(nextError);

    if (nextDocument !== file) {
      onChange(nextDocument);
    }
    if (onImagesChange !== undefined && nextImages.length !== current.length) {
      onImagesChange(nextImages);
    }
  }

  function removeImage(index: number): void {
    if (onImagesChange === undefined) {
      return;
    }

    onImagesChange((images ?? []).filter((_, position) => position !== index));
    setError(null);
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>

      <div
        className={cn(
          "rounded-lg border border-dashed px-4 py-5 text-center transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/30",
          disabled ? "opacity-50" : "",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) {
            setIsDragging(true);
          }
        }}
        onDragLeave={() => {
          setIsDragging(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          addFiles([...event.dataTransfer.files]);
        }}
      >
        <input
          accept={ACCEPT}
          className="sr-only"
          disabled={disabled}
          id={id}
          multiple
          onChange={(event) => {
            addFiles([...(event.target.files ?? [])]);
            // Let the same file be picked again after a rejection.
            event.target.value = "";
          }}
          ref={inputRef}
          type="file"
        />
        <label
          className={cn(
            "block text-sm",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
          htmlFor={id}
        >
          <Upload
            aria-hidden="true"
            className="mx-auto mb-1 size-4 text-muted-foreground"
          />
          {t("generate.form.images.drop")}
        </label>
      </div>

      {file === null ? null : (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <FileText aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">
            {t("generate.form.file.selected", { name: file.name })}
          </span>
          <span className="tabular-nums">{formatBytes(file.size)}</span>
          <Button
            disabled={disabled}
            onClick={clearDocument}
            size="xs"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
            {t("generate.form.file.remove")}
          </Button>
        </p>
      )}

      {images === undefined || images.length === 0 ? null : (
        <ImageStrip
          disabled={disabled}
          images={images}
          onRemove={removeImage}
        />
      )}

      {images === undefined ? null : (
        <p className="text-xs tabular-nums text-muted-foreground">
          {t("generate.form.images.usage", {
            count: images.length,
            max: MAX_IMAGES,
            used: formatBytes(uploadTotalBytes(file, images)),
            limit: formatBytes(MAX_UPLOAD_BYTES),
          })}
        </p>
      )}

      {error === null ? null : (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      {hint === undefined ? null : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** Thumbnails of the picked images, with object URLs owned by this component. */
function ImageStrip({
  images,
  disabled,
  onRemove,
}: {
  images: File[];
  disabled: boolean;
  onRemove: (index: number) => void;
}) {
  const t = useT();
  const urls = useMemo(
    () => images.map((image) => URL.createObjectURL(image)),
    [images],
  );

  useEffect(() => {
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [urls]);

  return (
    <ul className="flex flex-wrap gap-2">
      {images.map((image, index) => (
        <li className="relative" key={`${image.name}:${image.size}:${index}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the file the user just picked */}
          <img
            alt={image.name}
            className="size-16 rounded-md border object-cover"
            src={urls[index]}
          />
          <Button
            aria-label={t("generate.form.images.remove", { name: image.name })}
            className="absolute -right-1.5 -top-1.5 rounded-full"
            disabled={disabled}
            onClick={() => {
              onRemove(index);
            }}
            size="icon-xs"
            type="button"
            variant="secondary"
          >
            <X aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
