import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import React from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-nyeta-sans",
  subsets: ["thai", "latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08111F",
};

export const metadata: Metadata = {
  title: "Nyeta",
  description: "Visual assistance for blind users",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nyeta",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSansThai.variable} h-dvh w-full overflow-hidden overscroll-none antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
