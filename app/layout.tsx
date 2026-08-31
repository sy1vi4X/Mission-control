import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MISSION CONTROL",
  description: "A calm personal assignment and task dashboard.",
  openGraph: {
    title: "MISSION CONTROL",
    description: "A calm personal assignment and task dashboard.",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
