import type { BotSummary, UpdateBotInput } from "../../shared/ipc";
import type { LanguageCode } from "./preferences";

/** The starter team's ids and the names they are created with (backend bot-store.ts). */
const STARTER: ReadonlyArray<{ id: string; name: string }> = [
  { id: "mitra-lead", name: "Mitra" },
  { id: "asha-accounts", name: "Asha" },
  { id: "vikram-sales", name: "Vikram" },
  { id: "meera-support", name: "Meera" },
  { id: "arjun-research", name: "Arjun" },
  { id: "kavya-content", name: "Kavya" },
  { id: "dev-code", name: "Dev" },
  { id: "tara-ops", name: "Tara" },
  { id: "kabir-security", name: "Kabir" },
];

/**
 * Starter team names per app language, in the order of STARTER (lead, accounts, sales, support,
 * research, content, code, ops, security). Short, easy to say, no famous or religious figures.
 * English is used all over the world, so it gets a mix of countries. Hindi and Bengali keep the
 * Indian names the team is created with.
 */
export const STARTER_NAMES: Partial<Record<LanguageCode, readonly string[]>> = {
  en: ["Maya", "Emma", "Omar", "Sofia", "Kenji", "Chloe", "Wei", "Anna", "Ji-woo"],
  es: ["Sofía", "Lucía", "Mateo", "Valentina", "Diego", "Camila", "Pablo", "Elena", "Javier"],
  fr: ["Camille", "Chloé", "Louis", "Léa", "Hugo", "Manon", "Lucas", "Inès", "Jules"],
  de: ["Lena", "Anna", "Felix", "Mia", "Lukas", "Clara", "Jonas", "Sophie", "Paul"],
  it: ["Giulia", "Chiara", "Marco", "Sofia", "Luca", "Alessia", "Matteo", "Elena", "Andrea"],
  pt: ["Ana", "Beatriz", "Lucas", "Mariana", "Pedro", "Júlia", "Gabriel", "Larissa", "Rafael"],
  nl: ["Sanne", "Emma", "Daan", "Lotte", "Sem", "Fleur", "Bram", "Noor", "Thijs"],
  pl: ["Zofia", "Maja", "Jakub", "Hanna", "Kacper", "Julia", "Szymon", "Ola", "Filip"],
  ru: ["Anna", "Mariya", "Ivan", "Olga", "Dmitri", "Sofia", "Artyom", "Elena", "Maxim"],
  tr: ["Elif", "Zeynep", "Emre", "Ayşe", "Mehmet", "Defne", "Can", "Selin", "Burak"],
  ja: ["Yuki", "Hana", "Haruto", "Sakura", "Ren", "Aoi", "Sota", "Mei", "Kaito"],
  ko: ["Ji-woo", "Seo-yeon", "Min-jun", "Ha-eun", "Do-yun", "Ji-a", "Seo-jun", "Yu-na", "Joon"],
  zh: ["Mei", "Li Na", "Wei", "Xiao", "Hao", "Lin", "Jun", "Yan", "Chen"],
  ar: ["Layla", "Noor", "Omar", "Sara", "Yusuf", "Mariam", "Karim", "Huda", "Zaid"],
  he: ["Noa", "Tamar", "Itai", "Maya", "Yoav", "Shira", "Eitan", "Yael", "Ari"],
};

/**
 * The renames that give an untouched starter team names from the owner's language. A coworker
 * the owner already renamed (or one that is not part of the starter team) is never touched.
 * Hindi and Bengali (no list) and languages without a list give no renames.
 */
export function starterRenames(
  language: LanguageCode,
  bots: ReadonlyArray<Pick<BotSummary, "id" | "name">>,
): UpdateBotInput[] {
  const names = STARTER_NAMES[language];
  if (!names) return [];
  const renames: UpdateBotInput[] = [];
  STARTER.forEach((starter, index) => {
    const bot = bots.find((candidate) => candidate.id === starter.id);
    const next = names[index];
    if (bot && next && bot.name === starter.name) renames.push({ botId: bot.id, name: next });
  });
  return renames;
}

/** Applies starterRenames through the app. Failures are skipped: names stay editable anyway. */
export async function localiseStarterTeam(language: LanguageCode): Promise<void> {
  const agent = window.sahkarmi?.agent;
  if (!agent?.listBots || !agent.updateBot) return;
  try {
    const bots = await agent.listBots();
    for (const rename of starterRenames(language, bots)) {
      await agent.updateBot(rename).catch(() => undefined);
    }
  } catch {
    // The team keeps its names; nothing else depends on them.
  }
}
