import type { Metadata } from "next";
import "./globals.css";

const metadataBaseUrl = (process.env.APP_BASE_URL || '').trim() || 'http://localhost:3000';

export const metadata: Metadata = {
  // Explicit metadataBase prevents Next.js 14 from trying to derive a canonical
  // base URL from the request host header, which can be null in certain
  // proxy / tool environments and causes "TypeError: Invalid URL" on dynamic pages.
  metadataBase: new URL(metadataBaseUrl),
  title: "Apartment ERP",
  description: "Apartment Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="app-shell">
        {children}
      </body>
    </html>
  );
}
