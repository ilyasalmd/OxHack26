import { MAX_LEN, MAX_SNIPPETS } from "./chat-context";
import { BOT_CONTEXT } from "./bot-turns";
import { AI } from "./config";

/** Relevant messages per open stock when the AI re-marks (lib/markets.ts repriceGroup). */
export const STOCK_SNIPPETS = 8;

/** Where the AI runs, in the words the Terms and the privacy page use. */
export function aiWhere(hosted = AI.usesGoogle, local = AI.chain.includes("ollama")) {
  if (!hosted) return "To our server, where Gemma, an open model running on that same machine through Ollama, reads it to set the odds. No outside AI company receives it.";
  return `To our server, which passes it to Gemma, an open model, to set the odds. Gemma runs ${local ? "on that same machine through Ollama when it can, and otherwise " : ""}on Google's servers through the Gemini API. As we're in the UK, Google's terms say it doesn't use this to improve its products and keeps it only for a limited time to check for abuse. No other AI company receives it.`;
}

/**
 * The one description of what the AI gets from a chat. It is always on, so this is shown
 * before someone creates or joins a chat, in group info, in Settings and on the privacy page.
 * The numbers come from the code that does the filtering, and where it goes from the AI setting,
 * so the copy can't drift from either. `hosted` is for tests; the app reads the setting.
 */
export const aiChatNotice = (hosted = AI.usesGoogle, local = AI.chain.includes("ollama")) => ({
  title: "The AI reads relevant chat",
  status: "Always on, in every chat",
  short: `When someone lists a stake or re-marks stocks, their phone picks up to ${MAX_SNIPPETS} messages about that person or topic, hides names and contact details, and sends only those to the AI${hosted ? " through our server" : " on our server"}. Everyone sees what was sent.`,
  points: [
    {
      head: "What is picked",
      body: `Messages that mention the stake's person or topic, from the chat already decrypted on the phone of whoever is pricing. At most ${MAX_SNIPPETS} per stake and ${STOCK_SNIPPETS} per stock. Photos and voice notes are never picked.`,
    },
    {
      head: "What is removed first",
      body: `Names and @handles become roles (“[SUBJECT]”, “Friend A”). Emails, phone numbers, long numbers and links are cut. Each message is trimmed to ${MAX_LEN} characters. The sender goes as that role too, with how long ago it was sent, never as a name.`,
    },
    {
      head: "Where it goes",
      body: aiWhere(hosted, local),
    },
    {
      head: "What is kept",
      body: "The stake page keeps the messages the AI used, each with its reason, so everyone in the chat can check what moved the price. The pricing record keeps every anonymised message that was sent, and only the app's admin can open it. Both stay as long as the stake does. Your chat itself stays encrypted on the server.",
    },
    {
      head: "What you see first",
      body: "Whoever lists a stake sees every message their phone picked, and which ones the AI used, before anything is posted.",
    },
    {
      head: "Sample chats",
      body: `The sample people (Mum, Dad, Jake, Priya and the rest) are run by the app, only in the sample chats. To answer you, one of them opens the last ${BOT_CONTEXT} messages of that chat with their own copy of its key, as any member could, and Gemma writes their reply ${
        hosted
          ? `${local ? "on our server through Ollama when it can, and otherwise " : ""}on Google's servers through the Gemini API, so those messages go to Google. Emails, phone numbers and links are cut first; names and the rest of each message are not`
          : "on our server. Nothing leaves the server"
      }. It never happens in a chat you start.`,
    },
    {
      head: "Limits",
      body: "Redaction can't catch everything. A message that describes someone without naming them still gets through, and the way someone writes can identify them. Keep anything you wouldn't want priced out of chats that have stakes.",
    },
  ],
});

export const AI_CHAT = aiChatNotice();
