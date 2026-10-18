import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Me+",
  description: "Your personal companion for priorities, plans and progress.",
  icons: { icon: [{url: "/brand/favicon.ico"}, {url: "/brand/icon.svg", type: "image/svg+xml"}], apple: "/brand/apple-touch-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

