import { MAX_LEN, MAX_SNIPPETS } from "./chat-context";

/** Relevant messages per open stock when the AI re-marks (lib/markets.ts repriceGroup). */
export const STOCK_SNIPPETS = 8;

/**
 * The one description of what the AI gets from a chat. It is always on, so this is shown
 * before someone creates or joins a chat, in group info, in Settings and on the privacy page.
 * The numbers come from the code that does the filtering, so the copy can't drift from it.
 */
export const AI_CHAT = {
  title: "The AI reads relevant chat",
  status: "Always on, in every chat",
  short: `When someone lists a stake or re-marks stocks, their phone picks up to ${MAX_SNIPPETS} messages about that person or topic, hides names and contact details, and sends only those to the AI on our server. Everyone sees what was sent.`,
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
      body: "To our server, where Gemma, an open model running on that same machine through Ollama, reads it to set the odds. No outside AI company receives it.",
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
      head: "Limits",
      body: "Redaction can't catch everything. A message that describes someone without naming them still gets through, and the way someone writes can identify them. Keep anything you wouldn't want priced out of chats that have stakes.",
    },
  ],
} as const;
