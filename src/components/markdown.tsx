import Markdown, { type Components } from "react-markdown";

import { cn } from "@/lib/utils";

/**
 * Shared markdown rendering.
 *
 * The project has no typography plugin, so each element is styled explicitly
 * through the react-markdown `components` map. Raw HTML is never rendered (no
 * rehype-raw plugin is registered).
 */
export const markdownComponents: Components = {
  h1: ({ children }) => (
    <h3 className="mt-6 text-lg font-semibold first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="mt-5 text-base font-semibold first:mt-0">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="mt-4 text-sm font-semibold first:mt-0">{children}</h5>
  ),
  p: ({ children }) => <p className="mt-3 leading-relaxed first:mt-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a
      className="text-primary underline underline-offset-4"
      href={href}
      rel="noreferrer noopener"
      target="_blank"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-border pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-5 border-border" />,
};

/** Renders a markdown string with the shared element styles. */
export function MarkdownView({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("text-sm text-foreground", className)}>
      <Markdown components={markdownComponents}>{children}</Markdown>
    </div>
  );
}
