import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zebra Dashboard",
  description: "Track and visualize token usage from your AI coding tools",
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
