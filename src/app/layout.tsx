import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FAVICON_DATA_URL } from "@/lib/favicon";
import "./globals.css";

export const metadata: Metadata = {
  title: "Входящие",
  description: "Веб-клиент для работы со всеми почтовыми ящиками в одном окне",
  icons: {
    icon: [
      { url: FAVICON_DATA_URL, type: "image/svg+xml", sizes: "32x32" },
    ],
    shortcut: [{ url: FAVICON_DATA_URL, type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
