import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RuangKita · Sistem Peminjaman Ruangan Kantor",
  description: "Temukan ruangan, ajukan peminjaman, dan kelola jadwal kantor dalam satu tempat.",
  other: {
    "codex-preview": "development",
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
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
