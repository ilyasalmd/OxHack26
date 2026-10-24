import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/session";

export const metadata: Metadata = {
  title: "Friend Stocks",
  description: "Group chats where friends hold each other accountable with prediction markets.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0b0c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <div className="mx-auto min-h-dvh max-w-md border-x border-line bg-ink">{children}</div>
        </SessionProvider>
      </body>
    </html>
  );
}
