import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Suspense } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { I18nProvider } from "@/i18n/client";
import { getI18n } from "@/i18n/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "GenAI Learning Platform",
    template: "%s · GenAI Learning Platform",
  },
  description:
    "Interactive, AI-personalised mini-courses on software engineering, AI coding assistants and soft skills.",
};

/**
 * Resolves the UI language for the whole app.
 *
 * Reading the locale cookie is request-time work, so it happens inside a
 * Suspense boundary: the document shell stays prerenderable while every page
 * below it is rendered in the learner's language. The provider carries the
 * merged messages to client components; Server Components read them through
 * `getI18n()`.
 */
async function LocaleShell({ children }: { children: React.ReactNode }) {
  const { locale, messages } = await getI18n();

  return (
    <I18nProvider locale={locale} messages={messages}>
      <SiteNav />
      {children}
      <SiteFooter />
    </I18nProvider>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <LocaleShell>{children}</LocaleShell>
        </Suspense>
      </body>
    </html>
  );
}
