import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flow",
  description: "Engineering bootstrap for Flow",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
