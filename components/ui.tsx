"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-black"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export const fmt = (n: number, d = 2) => n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (p: number, d = 0) => `${(p * 100).toFixed(d)}%`;

export function Coins({ value, ticker, className = "" }: { value: number; ticker: string; className?: string }) {
  return (
    <span className={`tabular ${className}`}>
      {fmt(value)} <span className="text-mute">{ticker}</span>
    </span>
  );
}

export function Change({ from, to, asPct = true }: { from: number; to: number; asPct?: boolean }) {
  const d = to - from;
  const up = d >= 0;
  return (
    <span className={`tabular text-sm ${up ? "text-up" : "text-down"}`}>
      {up ? "▲" : "▼"} {asPct ? `${Math.abs(d * 100).toFixed(1)} pts` : fmt(Math.abs(d))}
    </span>
  );
}

/** Number that flashes green/red when it changes, like a live quote. */
export function LiveNumber({ value, children }: { value: number; children: React.ReactNode }) {
  const prev = useRef(value);
  const [cls, setCls] = useState("");
  useEffect(() => {
    if (value !== prev.current) {
      setCls(value > prev.current ? "flash-up" : "flash-down");
      prev.current = value;
      const t = setTimeout(() => setCls(""), 1000);
      return () => clearTimeout(t);
    }
  }, [value]);
  return <span className={cls}>{children}</span>;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="pop max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-line bg-panel p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Button({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "up" | "down" }) {
  const styles = {
    primary: "bg-white text-black hover:bg-white/90",
    ghost: "bg-white/5 text-white hover:bg-white/10 border border-line",
    up: "bg-up text-black hover:brightness-110",
    down: "bg-down text-white hover:brightness-110",
  }[variant];
  return <button {...p} className={`rounded-2xl px-4 py-3 font-semibold transition active:scale-[.98] disabled:opacity-40 ${styles} ${className}`} />;
}

export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`w-full rounded-2xl border border-line bg-black/40 px-4 py-3 outline-none placeholder:text-mute focus:border-white/40 ${p.className ?? ""}`} />;
}

export function TopBar({ title, back, right }: { title: React.ReactNode; back?: string; right?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur">
      {back && (
        <Link href={back} className="-ml-1 rounded-full px-2 py-1 text-xl text-mute hover:text-white">
          ‹
        </Link>
      )}
      <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
      {right}
    </div>
  );
}

export function Badge({ children, tone = "mute" }: { children: React.ReactNode; tone?: "mute" | "up" | "down" | "brand" }) {
  const t = { mute: "bg-white/5 text-mute", up: "bg-up/15 text-up", down: "bg-down/15 text-down", brand: "bg-brand/15 text-brand" }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>;
}

export function timeLeft(to: string | Date, now: string | Date) {
  const ms = new Date(to).getTime() - new Date(now).getTime();
  if (ms <= 0) return "closed";
  const h = ms / 3600000;
  if (h < 1) return `${Math.ceil(ms / 60000)}m left`;
  if (h < 48) return `${Math.round(h)}h left`;
  const d = h / 24;
  if (d < 60) return `${Math.round(d)}d left`;
  return `${Math.round(d / 30)}mo left`;
}

export function ago(t: string | Date, now: string | Date = new Date()) {
  const s = (new Date(now).getTime() - new Date(t).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
