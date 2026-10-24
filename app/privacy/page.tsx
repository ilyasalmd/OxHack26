import type { Metadata } from "next";
import { H, LegalPage, UL } from "@/components/legal";

export const metadata: Metadata = { title: "Privacy · FriendStakes" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy notice" updated="Draft of 24 October 2026">
      <p>This explains what FriendStakes keeps, who else sees it, and what you can do about it. The short version: the words in your group chats are end-to-end encrypted, but the situations you trade on are not, and some of what the game does is public on a blockchain.</p>

      <H>Who is responsible</H>
      <p><span className="text-white">[Name of the person or company running FriendStakes]</span>. Contact: <span className="text-white">[contact email to be added]</span>.</p>

      <H>What the server stores</H>
      <UL>
        <li><b className="text-white">Your account:</b> username, display name, colour, your coin balance and weekly top-up date, and a hash made from a key derived from your password. We never receive your password itself.</li>
        <li><b className="text-white">Your keys:</b> your public key, and your private key encrypted with a key that only your password can recreate. We can&apos;t open it.</li>
        <li><b className="text-white">Your groups:</b> which groups you&apos;re in, who else is in them, group names, and the optional &ldquo;AI context&rdquo; text a group writes (term dates, fixtures, deadlines).</li>
        <li><b className="text-white">Your play:</b> situations (title, details, who it&apos;s about, who created it, dates, the AI&apos;s reasoning, the result), your trades, positions and coin history, and short system notices such as &ldquo;Jake went long 20&rdquo;. These are stored readable.</li>
        <li><b className="text-white">Sign-in sessions:</b> a session cookie, plus the device name and a shortened IP address so you can see and sign out your sessions in Settings. We use IP addresses in memory for rate limits and do not store them for that.</li>
        <li><b className="text-white">Reports:</b> who reported what and why. See below.</li>
      </UL>

      <H>What is end-to-end encrypted</H>
      <p>The text of your chat messages is encrypted on your device with a key shared only among the group&apos;s members. The server stores the scrambled text, who sent it and when, and can&apos;t read it. Everything else listed above is not end-to-end encrypted. Leaving a group removes your access going forward; messages already on your device stay there.</p>
      <p>Two things can move chat text off your device, both by your choice. If a group turns on &ldquo;AI reads relevant chat&rdquo;, members&apos; phones may send up to 20 matching messages per situation to the AI, with names swapped for roles and emails, numbers and links removed; everyone in the chat is told when it&apos;s switched on or off. And if you report a message you can tick &ldquo;include the message text&rdquo;; we keep a copy only if you do.</p>

      <H>The pricing AI</H>
      <p>The AI that prices situations is Gemma, an open model that runs on the same machine as the app through Ollama. Nothing below is sent to an outside AI company.</p>
      <p>To price a situation we send the AI its title and details, the first name or display name of the person it&apos;s about, the group&apos;s AI context, and short summaries of similar situations that group has already settled. We also send titles to create a text embedding for finding similar past situations, and a settled situation&apos;s title, outcome, trading summary and any note the settler wrote, so it can be summarised for the group&apos;s history. If the person it&apos;s about answered the optional &ldquo;About you&rdquo; questions, those answers go to the AI too. They are never shown to other members, and you can change or delete yours in Settings. Without the AI the app uses a built-in stats model.</p>

      <H>Voice recaps</H>
      <p>If voice recaps are switched on, the recap text (a situation&apos;s title, its price, trading volume and the AI&apos;s reasoning) is sent to ElevenLabs to be read aloud. Otherwise your browser reads it out itself.</p>

      <H>Solana is public</H>
      <p>Every coin movement is mirrored as a token mint or burn on a Solana test network, and situations opening, settling or being called off are written as memos. Memos are public and can&apos;t be deleted. They can include the situation title (inside the reason for a coin movement), amounts, situation and group numbers, opening odds and results, and they are tied to your wallet&apos;s public address. They do not include your name, your username or chat messages. The tokens are worth nothing.</p>

      <H>Reports and safety</H>
      <p>A report records who reported, which situation or message, the reason and any note. We use reports to run the game fairly and keep it safe, and keep them as long as needed for that. If you report a message and choose to include its text, that text is kept with the report.</p>

      <H>Cookies and third parties</H>
      <p>One session cookie keeps you signed in. There are no ads, analytics or third-party trackers. The only outside services that receive data are the ones named above.</p>

      <H>Deleting your account</H>
      <p>Go to Settings and choose Delete account. That signs you out everywhere, removes you from your groups and scrubs your name, username, password hash, keys and wallet secret. Your past trades, positions and messages stay in your groups under &ldquo;Deleted user&rdquo; because the markets have to keep adding up, and messages stay unreadable to us. Anything already written to the blockchain stays there. Open situations about you are not kept going after you leave.</p>

      <H>Your rights</H>
      <p>You can ask to see, correct or delete what we hold about you, or object to how we use it, by writing to <span className="text-white">[contact email to be added]</span>. If you&apos;re in the UK or EU you can also complain to your data protection authority. FriendStakes is for people aged 16 and over, and we don&apos;t knowingly hold data about anyone younger.</p>
    </LegalPage>
  );
}
