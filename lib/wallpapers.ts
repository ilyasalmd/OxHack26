// Chat backgrounds: dark, quiet tones so bubbles stay readable. Each person picks one per chat.
const DOTS = "radial-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px)";

export const WALLPAPERS = [
  { id: "graphite", label: "Graphite", base: "#131417" },
  { id: "midnight", label: "Midnight", base: "linear-gradient(160deg, #0b1020, #121c38)" },
  { id: "ocean", label: "Ocean", base: "linear-gradient(160deg, #08161c, #0d2731)" },
  { id: "forest", label: "Forest", base: "linear-gradient(160deg, #0b1712, #11261c)" },
  { id: "plum", label: "Plum", base: "linear-gradient(160deg, #170d1a, #25132b)" },
  { id: "ember", label: "Ember", base: "linear-gradient(160deg, #1a0f0b, #2b1810)" },
  { id: "slate", label: "Slate", base: "linear-gradient(160deg, #14171c, #1f242c)" },
] as const;

export type WallpaperId = (typeof WALLPAPERS)[number]["id"];
export const isWallpaper = (id: unknown): id is WallpaperId => WALLPAPERS.some((w) => w.id === id);

/** Inline style for a chat's wall; null keeps the default dotted wall. */
export function wallpaperStyle(id: string | null | undefined): React.CSSProperties | undefined {
  const w = WALLPAPERS.find((x) => x.id === id);
  if (!w) return undefined;
  return { backgroundImage: `${DOTS}, ${w.base.startsWith("#") ? `linear-gradient(${w.base}, ${w.base})` : w.base}`, backgroundSize: "22px 22px, cover", backgroundAttachment: "local, scroll" };
}
