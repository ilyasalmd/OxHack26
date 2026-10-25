import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono, Unbounded } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/session";
import { Frame } from "@/components/shell";
import { ACCENT_BOOT } from "@/lib/theme";

const dmSans = DM_Sans({ subsets: ["latin"], axes: ["opsz"], variable: "--font-dm-sans" });
// Only the wordmark uses Unbounded.
const unbounded = Unbounded({ subsets: ["latin"], weight: "800", variable: "--font-unbounded" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "FriendStakes",
  description: "Group chats where friends hold each other accountable with prediction markets.",
};

// resizes-content: on Android the keyboard shrinks the page, so the message bar sits on top of it.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0d100a", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${unbounded.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: ACCENT_BOOT }} />
        <SessionProvider>
          <Frame>{children}</Frame>
        </SessionProvider>
      </body>
    </html>
  );
}
