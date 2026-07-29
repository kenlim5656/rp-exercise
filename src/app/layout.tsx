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
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
            <Link href="/runs" className="font-semibold tracking-tight">
              RP Lead Pipeline
            </Link>
            <nav className="flex gap-4 text-sm text-muted-foreground">
              <Link href="/runs" className="hover:text-foreground">
                Runs
              </Link>
              <Link href="/runs/new" className="hover:text-foreground">
                New upload
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
