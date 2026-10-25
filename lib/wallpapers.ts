// Chat backgrounds: quiet tones so bubbles stay readable. Each person picks one per chat. The colours live in
// app/globals.css as --wp-<id>, with a dark and a light version, so a background follows a light theme too.
const DOTS = "radial-gradient(var(--wall-dot) 1px, transparent 1px)";

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

/** Your own photo as the background: "photo:<attachment id>:<how much to darken it, 0 to 80>". */
export function photoWallpaper(id: string | null | undefined) {
  const m = /^photo:(\d+):(\d{1,2})$/.exec(id ?? "");
  return m && Number(m[2]) <= 80 ? { id: Number(m[1]), dim: Number(m[2]) } : null;
}

/** Inline style for a chat's wall; null keeps the default dotted wall. A photo needs its decrypted URL. */
export function wallpaperStyle(id: string | null | undefined, photoUrl?: string | null): React.CSSProperties | undefined {
  const photo = photoWallpaper(id);
  if (photo) {
    const shade = `linear-gradient(rgba(0, 0, 0, ${photo.dim / 100}), rgba(0, 0, 0, ${photo.dim / 100}))`;
    return photoUrl
      ? { backgroundColor: "var(--color-ink)", backgroundImage: `${shade}, url("${photoUrl}")`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "scroll" }
      : { backgroundColor: "var(--color-ink)", backgroundImage: "none" };
  }
  const w = WALLPAPERS.find((x) => x.id === id);
  if (!w) return undefined;
  return { backgroundImage: `${DOTS}, var(--wp-${w.id})`, backgroundSize: "22px 22px, cover", backgroundAttachment: "local, scroll" };
}
