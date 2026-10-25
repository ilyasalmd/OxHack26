"use client";
import { useEffect, useState } from "react";

// The app's theme. Each one is a whole palette, not just an accent: the background, panels, lines and text
// all take the tint, so switching from Lime to Sky recolours every screen. Lime is the default; the others
// are the muted yellows and pastels the app was designed around. A device preference, like the odds
// format: no account, no server. The colours themselves live in app/globals.css; `ink` and `brand` are
// repeated here for the picker swatches and the phone's status bar.

export type Accent = "lime" | "butter" | "peach" | "mint" | "sky" | "lilac";
export const ACCENTS: { k: Accent; label: string; blurb: string; brand: string; ink: string; panel: string }[] = [
  { k: "lime", label: "Lime", blurb: "The original. Olive black and lime.", brand: "#cfe36a", ink: "#0d100a", panel: "#1d2316" },
  { k: "butter", label: "Butter", blurb: "Warm brown-black and soft yellow.", brand: "#f0e08e", ink: "#14110a", panel: "#272216" },
  { k: "peach", label: "Peach", blurb: "Terracotta dark and apricot.", brand: "#f5bd8a", ink: "#160e0a", panel: "#2b1c17" },
  { k: "mint", label: "Mint", blurb: "Deep green and fresh mint.", brand: "#a9e4c5", ink: "#071410", panel: "#142822" },
  { k: "sky", label: "Sky", blurb: "Navy night and pale blue.", brand: "#9fcbf2", ink: "#0a1220", panel: "#16223a" },
  { k: "lilac", label: "Lilac", blurb: "Aubergine and lilac.", brand: "#c9b8f0", ink: "#110b1c", panel: "#221838" },
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
  if (a === "lime") delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = a;
  // The phone's status bar and the browser chrome match the page background.
  const ink = ACCENTS.find((x) => x.k === a)?.ink ?? ACCENTS[0].ink;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = ink));
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
export const ACCENT_BOOT = `try{var a=localStorage.getItem("${KEY}"),k=${JSON.stringify(Object.fromEntries(ACCENTS.map((x) => [x.k, x.ink])))};if(a&&k[a]){if(a!=="lime")document.documentElement.dataset.accent=a;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=k[a]}}catch(e){}`;
