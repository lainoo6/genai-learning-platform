import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";

/**
 * 404 page. Localised like the rest of the shell, so a mistyped URL does not
 * drop the reader back into English.
 */
export default async function NotFound() {
  const { t } = await getI18n();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start justify-center gap-3 px-4 py-20">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        404
      </p>
      <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t("notFound.hint")}
      </p>
      <Link className={buttonVariants({ variant: "outline" })} href="/courses">
        {t("notFound.back")}
      </Link>
    </main>
  );
}
