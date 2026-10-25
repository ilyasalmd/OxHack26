"use client";
import { Section, SettingsPage } from "@/components/settings";
import { Check } from "@/components/icons";
import { ODDS_FORMATS, useOddsFormat } from "@/lib/odds";
import { ACCENTS, useAccent } from "@/lib/theme";

/** How the app looks on this device: its colours and how odds are written. */
export default function ThemePage() {
  return (
    <SettingsPage title="Theme">
      <Section title="Colour" note="The accent the app wears. Just this device.">
        <div className="rounded-2xl border border-line bg-panel p-4"><AccentChoice /></div>
      </Section>
      <Section title="Odds" note="How a bet's price is written. Just this device.">
        <OddsChoice />
      </Section>
    </SettingsPage>
  );
}

function AccentChoice() {
  const [a, setA] = useAccent();
  return (
    <div className="flex flex-wrap gap-3">
      {ACCENTS.map((o) => (
        <button key={o.k} type="button" onClick={() => setA(o.k)} aria-pressed={a === o.k} title={o.label} className="flex flex-col items-center gap-1.5 text-xs text-mute">
          <span className={`flex h-11 w-11 items-center justify-center rounded-full transition ${a === o.k ? "ring-2 ring-white ring-offset-2 ring-offset-ink" : ""}`} style={{ background: o.brand }}>
            {a === o.k && <Check size={16} className="text-black" />}
          </span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function OddsChoice() {
  const [f, setF] = useOddsFormat();
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-panel p-1">
      {ODDS_FORMATS.map((o) => (
        <button key={o.k} type="button" onClick={() => setF(o.k)} aria-pressed={f === o.k} className={`rounded-xl py-2.5 text-center transition ${f === o.k ? "bg-white text-black" : "text-mute hover:text-white"}`}>
          <div className="text-sm font-semibold">{o.label}</div>
          <div className={`text-xs tabular ${f === o.k ? "text-black/50" : ""}`}>{o.example}</div>
        </button>
      ))}
    </div>
  );
}
