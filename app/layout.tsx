import type { Metadata } from "next";
import { Suspense } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Archivo } from "next/font/google";
import { Providers } from "./providers";
import { AppSidebar } from "@/components/app-sidebar";
import { AppToaster } from "@/components/app-toaster";
import { TopBar } from "@/components/top-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

/**
 * The display face. Geist alone is Vercel's default pairing, which is a large
 * part of why a competent build still reads as a template — Archivo gives the
 * headings a voice of their own. The width axis is the reason for this face
 * over any other: a heading can be widened for presence instead of only
 * thickened, which is what makes a title look set rather than styled.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

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
      className={`${GeistSans.variable} ${GeistMono.variable} ${archivo.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        <Providers>
          <TooltipProvider delayDuration={200}>
            <AppSidebar />

            {/* The old shell capped content at 4xl inside a 60-wide sidebar,
                which on any normal desktop left roughly a third of the window
                empty and the column adrift of centre. 6xl fills the space the
                sidebar leaves without letting prose run to an unreadable
                measure — the proposal page splits into a 320 rail, so its body
                column still lands near 55 characters. */}
            <div className="lg:pl-60">
              {/* TopBar reads search params, which needs a Suspense boundary. */}
              <Suspense
                fallback={<div className="h-14 border-b border-border" />}
              >
                <TopBar />
              </Suspense>

              <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
                {children}
              </main>
            </div>
          </TooltipProvider>

          <AppToaster />
        </Providers>
      </body>
    </html>
  );
}
