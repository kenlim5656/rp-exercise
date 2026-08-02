import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RP Lead Pipeline",
  description: "Marketing ops lead ingestion, scoring, and routing POC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <header className="top-bar sticky top-0 z-30">
          <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-6 py-3">
            {/* Logo / wordmark */}
            <Link href="/runs" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent-pipeline)] text-[11px] font-black text-black">
                RP
              </span>
              <span className="text-sm font-semibold tracking-tight text-foreground">
                Lead Pipeline
                <span className="ml-1.5 rounded-sm bg-[var(--accent-pipeline)]/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--accent-pipeline)]">
                  v2
                </span>
              </span>
            </Link>

            {/* Nav */}
            <nav className="flex gap-1">
              {[
                { href: "/runs", label: "Runs" },
                { href: "/runs/new", label: "New Upload" },
                { href: "/settings", label: "Settings" },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-[var(--muted)] hover:text-foreground"
                >
                  {label}
                </Link>
              ))}
            </nav>

            {/* Right side */}
            <div className="ml-auto flex items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-full border border-[var(--status-completed)]/30 bg-[var(--status-completed)]/8 px-2.5 py-1 text-[10px] font-medium text-[var(--status-completed)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-completed)]" />
                HubSpot Connected
              </div>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-[var(--muted)] hover:text-foreground"
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                GitHub
              </a>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
