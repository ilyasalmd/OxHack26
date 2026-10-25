"use client";
import { Section, SettingsPage } from "@/components/settings";
import { Check } from "@/components/icons";
import { ODDS_FORMATS, useOddsFormat } from "@/lib/odds";
import { ACCENTS, useAccent } from "@/lib/theme";

/** How the app looks on this device: its colours and how odds are written. */
export default function ThemePage() {
  return (
    <SettingsPage title="Theme">
      <Section title="Colour" note="The theme the whole app wears, inside and out. Just this device.">
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
  const current = ACCENTS.find((o) => o.k === a) ?? ACCENTS[0];
  return (
    <div>
      {/* Each swatch is a tiny picture of the app in that theme: its background, a panel and the accent. */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ACCENTS.map((o) => {
          const on = a === o.k;
          return (
            <button
              key={o.k}
              type="button"
              onClick={() => setA(o.k)}
              aria-pressed={on}
              title={o.blurb}
              className={`group flex flex-col items-center gap-1.5 rounded-2xl p-1.5 text-xs transition ${on ? "bg-white/[.08] text-white" : "text-mute hover:bg-white/[.04] hover:text-white"}`}
            >
              <span className={`relative block aspect-[4/5] w-full overflow-hidden rounded-xl transition ${on ? "ring-2 ring-white ring-offset-2 ring-offset-panel" : "ring-1 ring-white/10"}`} style={{ background: o.ink }}>
                <span className="absolute inset-x-2 top-2 h-[22%] rounded-md" style={{ background: o.panel }} />
                <span className="absolute inset-x-2 top-[38%] h-[14%] rounded-md opacity-70" style={{ background: o.panel }} />
                <span className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: o.brand, color: o.ink }}>
                  {on && <Check size={12} />}
                </span>
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-xs text-mute">{current.label}: {current.blurb}</p>
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
