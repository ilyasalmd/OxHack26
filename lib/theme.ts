"use client";
import { useEffect, useState } from "react";

// The accent colour. Lime is the default; the others are the muted yellows and pastels the app
// was designed around. A device preference, like the odds format: no account, no server.

export type Accent = "lime" | "butter" | "peach" | "mint" | "sky" | "lilac";
export const ACCENTS: { k: Accent; label: string; brand: string }[] = [
  { k: "lime", label: "Lime", brand: "#cfe36a" },
  { k: "butter", label: "Butter", brand: "#f0e08e" },
  { k: "peach", label: "Peach", brand: "#f5bd8a" },
  { k: "mint", label: "Mint", brand: "#a9e4c5" },
  { k: "sky", label: "Sky", brand: "#9fcbf2" },
  { k: "lilac", label: "Lilac", brand: "#c9b8f0" },
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

/** Runs before paint so the saved accent never flashes lime first. */
export const ACCENT_BOOT = `try{var a=localStorage.getItem("${KEY}");if(a&&a!=="lime")document.documentElement.dataset.accent=a}catch(e){}`;
