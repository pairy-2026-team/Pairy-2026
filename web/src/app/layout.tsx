import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { AlertListener } from "@/components/AlertListener";
import { DemoBadge } from "@/components/DemoBadge";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "Pairy 페어리",
  description: "친구와 맞대는 안전 키링, 페어리",
  appleWebApp: { capable: true, title: "Pairy", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#d9ccfb",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-dvh antialiased">
        <div className="pairy-bg" />
        <ToastProvider>
          <div className="relative mx-auto min-h-dvh max-w-[430px]">
            {children}
            <Suspense>
              <BottomNav />
              <AlertListener />
            </Suspense>
            <DemoBadge />
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
