"use client";
import Link from "next/link";
import { useSession } from "@/components/session";
import { useChatActions } from "@/components/shell";
import { ChatMark, chatName } from "@/components/chat/mark";
import { Group, SettingsPage } from "@/components/settings";
import { Button } from "@/components/ui";
import { ChevronRight, Plus, Users } from "@/components/icons";

/** The groups you're in (not private chats), each a tap away, plus starting or joining one. */
export default function GroupsPage() {
  const { me } = useSession();
  const actions = useChatActions();
  const groups = (me?.groups ?? []).filter((g) => !g.is_dm).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <SettingsPage title="Groups">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" className="flex items-center justify-center gap-2" onClick={actions.create}><Plus size={16} /> New group</Button>
        <Button type="button" variant="ghost" className="flex items-center justify-center gap-2" onClick={actions.join}><Users size={16} /> Join group</Button>
      </div>
      {groups.length ? (
        <Group title={`${groups.length} group${groups.length === 1 ? "" : "s"}`} note="One wallet across all of them. Each group keeps its own leaderboard.">
          {groups.map((g) => (
            <Link key={g.id} href={`/g/${g.id}`} className="flex min-h-[64px] items-center gap-3 px-4 py-2.5 transition hover:bg-raised active:bg-raised">
              <ChatMark g={g} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{chatName(g)}</div>
                <div className="truncate text-xs text-mute">
                  {g.members} member{g.members === 1 ? "" : "s"} · {g.open_markets ? `${g.open_markets} open stake${g.open_markets === 1 ? "" : "s"}` : "no open stakes"}
                </div>
              </div>
              <ChevronRight size={16} className="text-mute" />
            </Link>
          ))}
        </Group>
      ) : (
        <p className="px-1 text-sm text-mute">You&apos;re not in any groups yet. Start one, or join with a friend&apos;s invite code.</p>
      )}
      {actions.sheets}
    </SettingsPage>
  );
}
