import { getI18n } from "@/i18n/server";

/** Global footer. */
export async function SiteFooter() {
  const { t } = await getI18n();

  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2">
          <span aria-hidden="true">🎓</span>
          {t("footer.platform")}
        </p>

        <p className="flex items-center gap-2">
          <a
            className="underline-offset-4 hover:text-foreground hover:underline"
            href="https://github.com/lainoo6/genai-learning-platform"
            rel="noreferrer"
            target="_blank"
          >
            {t("footer.github")}
          </a>
        </p>
      </div>
    </footer>
  );
}
