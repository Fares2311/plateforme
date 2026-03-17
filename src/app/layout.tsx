import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { LocaleProvider } from "@/context/LocaleContext";
import { CallProvider } from "@/context/CallContext";
import { UIProvider } from "@/context/UIContext";
import { LiveSessionProvider } from "@/context/LiveSessionContext";
import { AccCallProvider } from "@/context/AccCallContext";
import Navbar from "@/components/Navbar";
import LiveSessionOverlay from "@/components/LiveSessionOverlay";
import AccCallOverlay from "@/components/AccCallOverlay";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Synkra - Accountability Partner",
  description: "Atteignez vos objectifs ensemble.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${inter.className} theme-dark`} suppressHydrationWarning>
        <UIProvider>
          <LocaleProvider>
            <AuthProvider>
              <CallProvider>
                <LiveSessionProvider>
                <AccCallProvider>
                  <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -1, pointerEvents: 'none', background: '#09090b', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: '-10%', left: '10%', width: '50vw', height: '50vw', background: 'rgba(99, 102, 241, 0.15)', filter: 'blur(100px)', borderRadius: '50%', transform: 'translate3d(0,0,0)' }} />
                    <div style={{ position: 'absolute', top: '10%', right: '-10%', width: '40vw', height: '40vw', background: 'rgba(236, 72, 153, 0.12)', filter: 'blur(120px)', borderRadius: '50%', transform: 'translate3d(0,0,0)' }} />
                  </div>
                  <Navbar />
                  <LiveSessionOverlay />
                  <AccCallOverlay />
                  <main className="min-h-screen" style={{ paddingTop: '6.5rem', position: 'relative' }}>
                    {children}
                  </main>
                </AccCallProvider>
                </LiveSessionProvider>
              </CallProvider>
            </AuthProvider>
          </LocaleProvider>
        </UIProvider>
      </body>
    </html>
  );
}
