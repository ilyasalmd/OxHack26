import { redirect } from "next/navigation";

// The all-stakes feed is gone: each chat shows its own stakes, and its tab is now Ranks. Old links land there.
export default function MarketsPage() {
  redirect("/ranks");
}
