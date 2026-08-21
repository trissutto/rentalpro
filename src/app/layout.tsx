import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";

const SITE_URL = "https://reservasita.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Reservas Ita — Casas de temporada em Itanhaém",
    template: "%s · Reservas Ita",
  },
  description:
    "Central de reservas das casas de alto padrão em Itanhaém, litoral sul de São Paulo. Reserve direto, com contrato digital e pagamento protegido.",
  manifest: "/manifest.json",
  applicationName: "Reservas Ita",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Reservas Ita",
  },
  icons: {
    icon: [
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: SITE_URL,
    siteName: "Reservas Ita",
    title: "Reservas Ita — Casas de temporada em Itanhaém",
    description:
      "Casas de alto padrão em Itanhaém, litoral sul de São Paulo. Conforto, segurança e experiências inesquecíveis.",
    images: [{ url: "/og-reservas-ita.jpg", width: 1200, height: 630, alt: "Reservas Ita" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reservas Ita — Casas de temporada em Itanhaém",
    description: "Casas de alto padrão em Itanhaém, litoral sul de São Paulo.",
    images: ["/og-reservas-ita.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#c9a84c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" translate="no">
      <body>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: "#1e293b",
              color: "#f8fafc",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: "500",
            },
            success: { iconTheme: { primary: "#22c55e", secondary: "#fff" } },
            error: { iconTheme: { primary: "#ef4444", secondary: "#fff" } },
          }}
        />
      </body>
    </html>
  );
}
