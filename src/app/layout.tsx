import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Mukta,
} from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display-src",
  display: "swap",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-src",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-src",
  display: "swap",
});

const deva = Mukta({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-deva-src",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Faarma - Pharmacy Management System",
    template: "%s · Faarma",
  },
  applicationName: "Faarma",
  description: "Pharmacy billing & stock for Nepali retail pharmacies",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon.png", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#20342a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} ${deva.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
