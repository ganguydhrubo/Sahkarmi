import type { LanguageCode } from "./preferences";

/**
 * The owner's line of business, asked once on first open. Home shows ready starter jobs for it,
 * so nobody has to face an empty box. "other" gets jobs every small business needs.
 */
export const TRADES = ["shop", "ca", "clinic", "school", "property", "other"] as const;
export type TradeId = (typeof TRADES)[number];

export function isTrade(value: unknown): value is TradeId {
  return typeof value === "string" && (TRADES as readonly string[]).includes(value);
}

/** Names of the trades, for the first-open choice and Settings. */
export const TRADE_NAMES: Record<TradeId, Record<"en" | "hi" | "bn", string>> = {
  shop: { en: "Shop or trading", hi: "दुकान या व्यापार", bn: "দোকান বা ব্যবসা" },
  ca: { en: "CA or accounts office", hi: "CA या अकाउंट्स ऑफ़िस", bn: "CA বা হিসাবের অফিস" },
  clinic: { en: "Clinic or pharmacy", hi: "क्लिनिक या दवा दुकान", bn: "ক্লিনিক বা ওষুধের দোকান" },
  school: { en: "School or coaching", hi: "स्कूल या कोचिंग", bn: "স্কুল বা কোচিং" },
  property: { en: "Property agent", hi: "प्रॉपर्टी एजेंट", bn: "প্রপার্টি এজেন্ট" },
  other: { en: "Something else", hi: "कुछ और", bn: "অন্য কিছু" },
};

/** New texts are written in English, Hindi and Bengali; other languages read English. */
export function wordsLanguage(language: LanguageCode): "en" | "hi" | "bn" {
  return language === "hi" || language === "bn" ? language : "en";
}

export function tradeName(trade: TradeId, language: LanguageCode): string {
  return TRADE_NAMES[trade][wordsLanguage(language)];
}
