import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UptimeCredit",
  description: "Evidence-bound SaaS outage claims and service credits on GenLayer Studionet.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
