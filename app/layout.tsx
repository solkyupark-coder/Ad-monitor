import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "광고 모니터링", description: "하우스케이퍼 · 토포제네시스 채널 성과" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
