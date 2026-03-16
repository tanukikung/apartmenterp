import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
