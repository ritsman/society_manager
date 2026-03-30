import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import ThemeToggle from "@/components/ThemeToggle";
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
  title: "Society Manager",
  description: "Society billing and accounting management",
};

const themeScript = `
  (function() {
    const storageKey = "society-manager-theme";
    const storedTheme = localStorage.getItem(storageKey) || "system";
    const resolvedTheme =
      storedTheme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : storedTheme;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = storedTheme;
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeToggle />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
