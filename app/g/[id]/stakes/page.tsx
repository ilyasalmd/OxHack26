"use client";
import { Suspense, use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/session";
import { GroupStakes, STAKE_FILTERS, type StakeFilter } from "@/components/group-stakes";
import { TopBar } from "@/components/ui";

/** A chat's own stakes, full screen: what the "N live" button in the chat opens on a phone. */
export default function GroupStakesPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  return (
    <Suspense fallback={null}>
      <Stakes id={id} />
    </Suspense>
  );
}

function Stakes({ id }: { id: number }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get("f") as StakeFilter | null;
  const [filter, setFilter] = useState<StakeFilter>(STAKE_FILTERS.some((x) => x.k === asked) ? asked! : "all");
  useEffect(() => {
    if (!loading && !me) router.replace(`/?next=/g/${id}/stakes`);
  }, [loading, me, router, id]);
  if (!me) return null;
  const g = me.groups.find((x) => x.id === id);
  const pick = (f: StakeFilter) => {
    setFilter(f);
    // Keep the filter in the address, so back from a stake page lands on the same list.
    router.replace(f === "all" ? `/g/${id}/stakes` : `/g/${id}/stakes?f=${f}`, { scroll: false });
  };
  return (
    <main className="min-h-dvh lg:min-h-full">
      <TopBar back={`/g/${id}`} backOnDesktop title={<div><div className="leading-tight">Stakes</div><div className="text-xs font-normal text-mute">{g?.name ?? "Chat"}</div></div>} />
      <div className="mx-auto max-w-3xl px-4 pb-10 pt-4 lg:px-10">
        <GroupStakes groupId={id} meId={me.user.id} ticker={me.config.currency.ticker} filter={filter} onFilter={pick} />
      </div>
    </main>
  );
}
