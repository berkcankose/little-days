import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./little-days.css";

export const metadata: Metadata = {
  title: "Little Days",
  description: "A small, beautiful way to notice time passing.",
  applicationName: "Little Days",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#f7f4ec",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
