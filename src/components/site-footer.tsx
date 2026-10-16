/**
 * Global footer. The GitHub link stays a placeholder until the repository is
 * created on launch day (task U1).
 */
export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2">
          <span aria-hidden="true">🎓</span>
          GenAI Learning Platform
        </p>

        <p className="flex items-center gap-2">
          {/* TODO(U1): replace this placeholder with the real repository URL. */}
          <span>GitHub</span>
          <span className="text-xs">(link pending)</span>
        </p>
      </div>
    </footer>
  );
}
