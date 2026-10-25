import type { Metadata } from "next";
import { H, LegalPage, UL } from "@/components/legal";
import { AI_CHAT } from "@/lib/ai-disclosure";

export const metadata: Metadata = { title: "Terms · FriendStakes" };

export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="Draft of 24 October 2026">
      <p>FriendStakes is a game for groups of friends. You post &ldquo;stakes&rdquo; about things you or your friends might do (&ldquo;Jake is late to Friday dinner&rdquo;) and trade coins on whether they happen. These terms are the rules of the game. They are short on purpose.</p>

      <H>1. Coins are play money</H>
      <UL>
        <li>Coins have no cash value. You can&apos;t buy them, sell them, send them to another person or withdraw them. There are no prizes and nothing you win can be exchanged for money, goods or services.</li>
        <li>Everyone starts with the same balance and gets a small weekly top-up, free. Nothing in the app asks for or takes payment.</li>
        <li>Don&apos;t trade, sell or swap coins or accounts outside the app, or promise anyone anything of real value for how a stake turns out. If we find that happening we can reset balances or remove accounts.</li>
        <li>Every coin movement is also mirrored as a token on a Solana test network (devnet). Those tokens are part of the game, not an investment, and are worth nothing.</li>
      </UL>

      <H>2. You must be 16 or over</H>
      <p>FriendStakes is for people aged 16 and over. Coins are play money with no cash value, so this isn&apos;t gambling, but if we believe someone is younger than 16 we can close their account.</p>

      <H>3. Keep it to things people choose to do</H>
      <p>Stakes should be about choices and plans: turning up on time, finishing a run, getting the flat sorted. They must not be about anyone&apos;s health, pregnancy, death or self-harm, sexuality, weight or body, religion or ethnicity, and must not harass, humiliate, expose private information about, or put anyone at risk. The app blocks the obvious cases, but the rule is yours to follow too, including in chat.</p>

      <H>4. Stakes about you</H>
      <UL>
        <li>You can turn off stakes about you, so friends can&apos;t pick you as the subject of a new one. You can always post about yourself.</li>
        <li>Whoever a stake is about can call it off at any time before it settles. It is voided and everyone is refunded exactly what they put in.</li>
        <li>Anyone in the group can report a stake or a chat message. If two members report a stake, or the person it&apos;s about does, it is called off and refunded automatically.</li>
      </UL>

      <H>5. How results are settled</H>
      <p>One member proposes the result and the rest of the chat votes on it. The proposer, the person it&apos;s about and anyone the result would pay don&apos;t vote. It settles once more than half of the voters confirm it (at least two, when two or more can vote), and the claim is dropped once more than half reject it. If the vote isn&apos;t decided within 24 hours of the deadline (or of the claim, if later), the result settles as proposed unless more people rejected it than confirmed it. Before the deadline, any member can say it has already happened if they add evidence (a note or a photo); that goes to the same vote, and if it&apos;s rejected, trading simply opens again. When the deadline arrives, everyone in the chat is told so someone can call the result. If nobody has called it within 3 days of the deadline, the stake is called off and everyone is refunded what they put in, fees included; the market&apos;s price is never used as the result, and an unverified stake never counts in the history used to price later ones. Trading stops as soon as a result is proposed. Settling is between friends and is not an official verdict on anything.</p>

      <H>6. Your account and your chats</H>
      <UL>
        <li>You&apos;re responsible for your password and recovery code. Chat messages are end-to-end encrypted, so if you lose access to your account we can&apos;t read or recover your messages for you.</li>
        <li>Don&apos;t share your account or use it to impersonate anyone.</li>
        <li>You can leave a group at any time. Your open positions stay and still settle, and open stakes about you are called off.</li>
        <li>You can delete your account in Settings. See the privacy notice for what that does.</li>
      </UL>

      <H id="ai">7. {AI_CHAT.title}</H>
      <p>{AI_CHAT.status}. You agree to this when you create an account. {AI_CHAT.short}</p>
      <UL>
        {AI_CHAT.points.map((p) => (
          <li key={p.head}><b className="text-white">{p.head}:</b> {p.body}</li>
        ))}
      </UL>
      <p>There is no setting to turn this off. If a chat should stay fully private, don&apos;t post stakes in it.</p>

      <H>8. Our right to act</H>
      <p>We can remove stakes, messages or accounts that break these terms, and we may change or reset the game&apos;s balances and data. FriendStakes is an early product provided as it is, with no promise that it will always be available or error-free, and we are not liable for losses, which for play money means losing coins.</p>

      <H>9. Changes and contact</H>
      <p>We may update these terms and will say so in the app when we do. Questions or reports: <span className="text-white">[contact email to be added]</span>.</p>
    </LegalPage>
  );
}
