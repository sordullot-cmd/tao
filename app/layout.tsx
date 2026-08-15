import type { Metadata } from "next";
import localFont from "next/font/local";
import { JetBrains_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/supabaseAuthProvider";
import { UndoProvider } from "@/lib/contexts/UndoContext";
import PWAInstall from "@/components/PWAInstall";
import ErrorBoundary from "@/components/ErrorBoundary";

// OpenAI Sans (locale) — variable utilisée dans toute l'app : --font-geist-sans
const openAISans = localFont({
  variable: "--font-geist-sans",
  display: "swap",
  src: [
    { path: "../public/fonts/OpenAISans-Light.woff2",         weight: "300", style: "normal" },
    { path: "../public/fonts/OpenAISans-LightItalic.woff2",   weight: "300", style: "italic" },
    { path: "../public/fonts/OpenAISans-Regular.woff2",       weight: "400", style: "normal" },
    { path: "../public/fonts/OpenAISans-RegularItalic.woff2", weight: "400", style: "italic" },
    { path: "../public/fonts/OpenAISans-Medium.woff2",        weight: "500", style: "normal" },
    { path: "../public/fonts/OpenAISans-MediumItalic.woff2",  weight: "500", style: "italic" },
    { path: "../public/fonts/OpenAISans-Semibold.woff2",      weight: "600", style: "normal" },
    { path: "../public/fonts/OpenAISans-SemiboldItalic.woff2",weight: "600", style: "italic" },
    { path: "../public/fonts/OpenAISans-Bold.woff2",          weight: "700", style: "normal" },
    { path: "../public/fonts/OpenAISans-BoldItalic.woff2",    weight: "700", style: "italic" },
  ],
});

// Outfit — police de la nouvelle direction artistique (maquette Figma).
// Exposée en --font-outfit ; app/globals.css la câble sur --font-sans.
// `variable` (sans liste de poids) charge l'axe complet : les valeurs
// intermédiaires comme 550 sont alors rendues telles quelles, là où une liste
// de poids discrets les arrondit au cran le plus proche.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tao-trade.vercel.app"),
  title: {
    default: "tao trade",
    template: "%s · tao trade",
  },
  description: "Plateforme de trading : journal, stratégies, discipline, productivité.",
  applicationName: "tao trade",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  // Open Graph (Facebook / LinkedIn / Discord / Slack)
  openGraph: {
    type: "website",
    siteName: "tao trade",
    title: "tao trade",
    description: "Plateforme de trading : journal, stratégies, discipline, productivité.",
    url: "https://tao-trade.vercel.app",
    images: [
      { url: "/web-app-manifest-512x512.png", width: 512, height: 512, alt: "tao trade" },
    ],
    locale: "fr_FR",
  },
  // Twitter / X card
  twitter: {
    card: "summary",
    title: "tao trade",
    description: "Plateforme de trading : journal, stratégies, discipline, productivité.",
    images: ["/web-app-manifest-512x512.png"],
  },
  // Indexation : on autorise sur la landing/login (server-side redirect →
  // /login) ; les pages applicatives privées sont exclues via robots.ts.
  robots: {
    index: true,
    follow: true,
  },
  // Vérification de propriété Google Search Console (méthode balise HTML).
  verification: { google: "jZXhpXDt07hrkP9kizrwVnDJ41gyOv7VBqvRgnFSzA8" },
  appleWebApp: {
    capable: true,
    title: "tao trade",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#F5F5F5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${outfit.variable} ${openAISans.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Thème + accent appliqués avant l'hydratation (évite le flash de couleur).
            Script brut plutôt que next/script : `beforeInteractive` re-rend une balise
            <script> côté client, que React ignore en émettant un warning. Ici le script
            part dans le HTML du serveur et s'exécute une seule fois, au bon moment.
            L'accent vient de Réglages → Apparence (lib/ui/accent.ts). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('tr4de_theme');if(t==='dark')document.documentElement.dataset.theme='dark';var h=/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i,r=document.documentElement,a=localStorage.getItem('tr4de_accent'),b=localStorage.getItem('tr4de_accent_2');if(a&&h.test(a))r.style.setProperty('--accent',a);if(b&&h.test(b))r.style.setProperty('--accent-2',b);}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ErrorBoundary>
          <AuthProvider>
            <UndoProvider>
              {children}
            </UndoProvider>
          </AuthProvider>
        </ErrorBoundary>
        <PWAInstall />
      </body>
    </html>
  );
}
