import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paperclip — chat to PDF",
  description: "Describe a document, watch it build, export a print-ready PDF. No account needed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
