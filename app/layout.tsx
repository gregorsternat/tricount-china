import type { Metadata, Viewport } from "next";

import "@fontsource-variable/manrope";
import "@fontsource-variable/noto-sans-sc";

import "./globals.css";

export const metadata: Metadata = {
  title: "Fēn · Mon année en Chine",
  description:
    "Importe WeChat Pay et Alipay, suis ton budget et partage les dépenses de tes tricounts en RMB.",
  applicationName: "Fēn",
  icons: {
    icon: "/assets/fen-logo-mark-v2.png",
    apple: "/assets/fen-logo-mark-v2.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f1e9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
