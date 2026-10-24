import Link from "next/link";
import { ChevronLeft } from "./icons";

/** Shared frame for the Terms and Privacy pages. Server component: no session needed to read them. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-6">
      <Link href="/" className="-ml-1.5 inline-flex items-center gap-1 rounded-md p-1 text-sm text-mute hover:bg-white/5 hover:text-white">
        <ChevronLeft size={16} /> Back
      </Link>
      <div className="mt-4 inline-block rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-medium text-mute">Draft, not legal advice</div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-mute">{updated}</p>
      <div className="mt-6 space-y-3 text-[15px] leading-relaxed text-white/80">{children}</div>
      <nav className="mt-10 flex gap-4 border-t border-line pt-4 text-sm text-mute">
        <Link href="/terms" className="hover:text-white">Terms</Link>
        <Link href="/privacy" className="hover:text-white">Privacy</Link>
      </nav>
    </main>
  );
}

export const H = ({ children }: { children: React.ReactNode }) => <h2 className="!mt-8 text-lg font-semibold tracking-tight text-white">{children}</h2>;
export const UL = ({ children }: { children: React.ReactNode }) => <ul className="list-disc space-y-1.5 pl-5 marker:text-mute">{children}</ul>;
