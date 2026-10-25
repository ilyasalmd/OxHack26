"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Close } from "./icons";
import { useUserPhoto } from "./media";

/** A person's initial on their colour, or their profile photo when `id` is given and they've shared it. */
export function Avatar({ name, color, size = 36, id }: { name: string; color: string; size?: number; id?: number }) {
  const photo = useUserPhoto(id);
  if (photo)
    return <img src={photo} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
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

/** Bottom sheet on a phone, centred dialog on a laptop. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] lg:items-center lg:p-6" onClick={onClose}>
      <div className="pop thin-scroll max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-line bg-panel p-5 pb-8 lg:max-w-lg lg:rounded-2xl lg:border lg:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line lg:hidden" />
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <button onClick={onClose} className="hidden rounded-md p-1 text-mute hover:bg-white/5 hover:text-white lg:block" aria-label="Close"><Close size={16} /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Button({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "up" | "down" }) {
  const styles = {
    primary: "bg-white text-black hover:bg-white/90",
    ghost: "bg-white/5 text-white hover:bg-white/10 border border-line",
    // The "go" action wears the theme's accent rather than a fixed green.
    up: "bg-brand text-black hover:brightness-105",
    down: "bg-down text-white hover:brightness-110",
  }[variant];
  return <button {...p} className={`rounded-xl px-4 py-2.5 font-medium transition active:scale-[.98] disabled:opacity-40 ${styles} ${className}`} />;
}

export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  // Off unless a field asks for it: otherwise Safari offers saved passwords in ordinary text boxes.
  return <input autoComplete="off" {...p} className={`w-full rounded-xl border border-line bg-ink px-3.5 py-2.5 outline-none placeholder:text-mute focus:border-white/40 ${p.className ?? ""}`} />;
}

export function TopBar({ title, back, right, backOnDesktop = false }: { title: React.ReactNode; back?: string; right?: React.ReactNode; backOnDesktop?: boolean }) {
  return (
    <div className="sticky top-0 z-30 flex min-h-[57px] items-center gap-3 border-b border-line bg-ink/90 px-4 py-2.5 backdrop-blur lg:px-6">
      {back && (
        <Link href={back} className={`-ml-1.5 rounded-md p-1 text-mute hover:bg-white/5 hover:text-white ${backOnDesktop ? "" : "lg:hidden"}`} aria-label="Back">
          <ChevronLeft size={20} />
        </Link>
      )}
      <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
      {right}
    </div>
  );
}

export function Badge({ children, tone = "mute" }: { children: React.ReactNode; tone?: "mute" | "up" | "down" | "brand" }) {
  const t = { mute: "bg-white/5 text-mute", up: "bg-up/15 text-up", down: "bg-down/15 text-down", brand: "bg-brand/15 text-brand" }[tone];
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>;
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
