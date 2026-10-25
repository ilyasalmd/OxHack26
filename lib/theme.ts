"use client";
import { useEffect, useState } from "react";

// The app's theme. Each one is a whole palette, not just an accent: the background, panels, lines and text
// all take the tint, so switching from Lime to Sky recolours every screen, and a light theme turns the whole
// app light. Lime is the default. A device preference, like the odds format: no account, no server. The
// colours themselves live in app/globals.css; `ink`, `panel` and `brand` are repeated here for the picker
// swatches and the phone's status bar.

export type Accent = "lime" | "butter" | "peach" | "mint" | "sky" | "lilac" | "midnight" | "sunset" | "forest" | "neon" | "mono" | "daylight" | "paper" | "blossom";
export type Mode = "dark" | "light";
export const ACCENTS: { k: Accent; label: string; mode: Mode; blurb: string; brand: string; ink: string; panel: string }[] = [
  { k: "lime", label: "Lime", mode: "dark", blurb: "The original. Olive black and lime.", brand: "#cfe36a", ink: "#0d100a", panel: "#151a10" },
  { k: "butter", label: "Butter", mode: "dark", blurb: "Warm brown-black and soft yellow.", brand: "#f0e08e", ink: "#14110a", panel: "#1d1910" },
  { k: "peach", label: "Peach", mode: "dark", blurb: "Terracotta dark and apricot.", brand: "#f5bd8a", ink: "#160e0a", panel: "#211512" },
  { k: "mint", label: "Mint", mode: "dark", blurb: "Deep green and fresh mint.", brand: "#a9e4c5", ink: "#071410", panel: "#0e1d18" },
  { k: "sky", label: "Sky", mode: "dark", blurb: "Navy night and pale blue.", brand: "#9fcbf2", ink: "#0a1220", panel: "#101a2c" },
  { k: "lilac", label: "Lilac", mode: "dark", blurb: "Aubergine and lilac.", brand: "#c9b8f0", ink: "#110b1c", panel: "#19112a" },
  { k: "midnight", label: "Midnight", mode: "dark", blurb: "Ink-black blue with an electric indigo.", brand: "#8ea2ff", ink: "#05070f", panel: "#0b0f1e" },
  { k: "sunset", label: "Sunset", mode: "dark", blurb: "Dusky plum and a coral sun.", brand: "#ff9a76", ink: "#170a12", panel: "#22101b" },
  { k: "forest", label: "Forest", mode: "dark", blurb: "Pine green and old gold.", brand: "#e2c068", ink: "#0a130d", panel: "#111d15" },
  { k: "neon", label: "Neon", mode: "dark", blurb: "Pitch black, hot pink, arcade glow.", brand: "#ff5fd2", ink: "#07060a", panel: "#100e16" },
  { k: "mono", label: "Mono", mode: "dark", blurb: "Black and white. Nothing else.", brand: "#f2f2f2", ink: "#000000", panel: "#0e0e0e" },
  { k: "daylight", label: "Daylight", mode: "light", blurb: "Clean white with a deep blue.", brand: "#2457e6", ink: "#f2f4f8", panel: "#ffffff" },
  { k: "paper", label: "Paper", mode: "light", blurb: "Warm paper and terracotta ink.", brand: "#a6461f", ink: "#f5efe4", panel: "#fffaf2" },
  { k: "blossom", label: "Blossom", mode: "light", blurb: "Soft pink with a berry accent.", brand: "#b8236b", ink: "#fbf1f5", panel: "#ffffff" },
];
const KEY = "accent";
const EVENT = "accent";

export function readAccent(): Accent {
  try {
    const v = localStorage.getItem(KEY);
    if (ACCENTS.some((a) => a.k === v)) return v as Accent;
  } catch {}
  return "lime";
}

export function applyAccent(a: Accent) {
  const t = ACCENTS.find((x) => x.k === a) ?? ACCENTS[0];
  const root = document.documentElement;
  if (t.k === "lime") delete root.dataset.accent;
  else root.dataset.accent = t.k;
  if (t.mode === "light") root.dataset.mode = "light";
  else delete root.dataset.mode;
  // The phone's status bar and the browser chrome match the page background.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = t.ink));
}

export function writeAccent(a: Accent) {
  try {
    localStorage.setItem(KEY, a);
  } catch {}
  applyAccent(a);
  window.dispatchEvent(new Event(EVENT));
}

export function useAccent(): [Accent, (a: Accent) => void] {
  const [a, setA] = useState<Accent>("lime");
  useEffect(() => {
    const sync = () => setA(readAccent());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [a, writeAccent];
}

/** Runs before paint so the saved theme never flashes lime first. */
export const ACCENT_BOOT = `try{var a=localStorage.getItem("${KEY}"),k=${JSON.stringify(Object.fromEntries(ACCENTS.map((x) => [x.k, [x.ink, x.mode]])))},t=a&&k[a],d=document.documentElement;if(t){if(a!=="lime")d.dataset.accent=a;if(t[1]==="light")d.dataset.mode="light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=t[0]}}catch(e){}`;
