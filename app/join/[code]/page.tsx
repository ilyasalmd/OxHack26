"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session";
import { api } from "@/components/api";

export default function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { me, loading } = useSession();
  const router = useRouter();
  const [err, setErr] = useState("");
  useEffect(() => {
    if (loading) return;
    if (!me) return router.replace(`/?next=/join/${code}`);
    api<{ id: number }>("/api/groups/join", { body: { code } })
      .then(({ id }) => router.replace(`/g/${id}`))
      .catch((e) => setErr(e.message));
  }, [loading, me, code, router]);
  return <main className="p-10 text-center text-mute">{err || "Joining…"}</main>;
}
