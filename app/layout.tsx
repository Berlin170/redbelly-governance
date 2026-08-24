import type { Metadata } from "next";
import { Suspense } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://redbelly-governance.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "Redbelly DAO — Governance",
    template: "%s — Redbelly DAO",
  },
  description: "Proposals and gasless signature voting for the Redbelly DAO.",
  openGraph: {
    siteName: "Redbelly DAO",
    type: "website",
    url: SITE,
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        <Providers>
          <TooltipProvider delayDuration={200}>
            <AppSidebar />

            <div className="lg:pl-60">
              {/* TopBar reads search params, which needs a Suspense boundary. */}
              <Suspense
                fallback={<div className="h-14 border-b border-border" />}
              >
                <TopBar />
              </Suspense>

              <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
                {children}
              </main>
            </div>
          </TooltipProvider>

          <Toaster theme="dark" position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
