import type { Metadata, Viewport } from "next";

import "@fontsource-variable/manrope";
import "@fontsource-variable/noto-sans-sc";

import { I18nProvider } from "@/components/i18n";
import { getLocale, getMessages } from "@/lib/i18n/server";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const messages = await getMessages();

  return {
    title: messages.metadata.root.title,
    description: messages.metadata.root.description,
    applicationName: "Fēn",
    icons: {
      icon: "/assets/fen-logo-mark-v2.png",
      apple: "/assets/fen-logo-mark-v2.png",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f1e9",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages(locale);

  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale} messages={messages}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
