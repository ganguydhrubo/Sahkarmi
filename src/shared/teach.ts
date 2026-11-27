/**
 * "Teach a task": the owner does a browser job once by hand, and the steps become a skill a
 * coworker can follow later. This file holds what both sides share: the shape of a recorded
 * step, how a step reads in plain words, and how the steps become a skill.
 */
export type TeachStep =
  | { kind: "open"; url: string }
  | { kind: "click"; name: string; role: string }
  /** value is null for a password, code, PIN or card field: it is never recorded. */
  | { kind: "type"; field: string; value: string | null }
  | { kind: "choose"; field: string; value: string }
  | { kind: "key"; key: string };

/** A recording stops growing here; a job with more steps is better taught in parts. */
export const MAX_TEACH_STEPS = 200;

function words(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** A page address without the part after ? or #: those often hold private ids. */
export function plainAddress(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}

/**
 * Long numbers (cards, phones, bank and ID numbers) and things that look like a key or token
 * are not kept, even from an ordinary field.
 */
export function safeTypedValue(value: string): string | null {
  const text = words(value, 120);
  if (!text) return "";
  if (/\d[\d\s-]{7,}\d/.test(text)) return null;
  if (/^[A-Za-z0-9_\-+/=.]{24,}$/.test(text) && /\d/.test(text) && /[A-Za-z]/.test(text)) {
    return null;
  }
  return text;
}

/** Takes whatever the page-side recorder sent and keeps only a well-formed step. */
export function parseTeachStep(raw: unknown): TeachStep | null {
  if (typeof raw !== "object" || raw === null) return null;
  const step = raw as Record<string, unknown>;
  switch (step.kind) {
    case "click": {
      const name = words(step.name, 80);
      return name ? { kind: "click", name, role: words(step.role, 20) || "button" } : null;
    }
    case "type": {
      const field = words(step.field, 80) || "the field";
      if (step.value === null) return { kind: "type", field, value: null };
      return { kind: "type", field, value: safeTypedValue(words(step.value, 120)) };
    }
    case "choose": {
      const value = words(step.value, 80);
      return value ? { kind: "choose", field: words(step.field, 80) || "the list", value } : null;
    }
    case "key":
      return step.key === "Enter" ? { kind: "key", key: "Enter" } : null;
    default:
      return null;
  }
}

/** Adds a step, dropping an exact repeat of the one before (a double click, a second blur). */
export function addTeachStep(steps: TeachStep[], step: TeachStep): boolean {
  if (steps.length >= MAX_TEACH_STEPS) return false;
  const last = steps[steps.length - 1];
  if (last && JSON.stringify(last) === JSON.stringify(step)) return false;
  // A field changed twice in a row keeps only the last words typed.
  if (last?.kind === "type" && step.kind === "type" && last.field === step.field) {
    steps[steps.length - 1] = step;
    return true;
  }
  steps.push(step);
  return true;
}

/** One step in plain words, as the coworker will read it. */
export function teachStepLine(step: TeachStep): string {
  switch (step.kind) {
    case "open":
      return `Open ${step.url}`;
    case "click":
      return `Click "${step.name}" (${step.role})`;
    case "type":
      if (step.value === null) {
        return `In "${step.field}" the owner types something private (a password, code or number). Ask the owner for it with the secure input; never guess it.`;
      }
      return step.value
        ? `Type into "${step.field}" (the owner's example: "${step.value}"; use the right words for the job at hand)`
        : `Clear "${step.field}"`;
    case "choose":
      return `Choose "${step.value}" in "${step.field}"`;
    case "key":
      return "Press Enter";
  }
}

export function teachStepLines(steps: TeachStep[]): string[] {
  return steps.map(teachStepLine);
}

/** The skill file for a taught task, in the shape "Add a skill from text" already accepts. */
export function teachSkillMarkdown(input: {
  name: string;
  whenToUse: string;
  lines: string[];
}): string {
  const name =
    words(input.name, 60)
      .replace(/[:#\n]/g, " ")
      .trim() || "Taught task";
  const when =
    words(input.whenToUse, 200).replace(/\n/g, " ") ||
    "Steps the owner showed once in the browser.";
  const lines = input.lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX_TEACH_STEPS);
  return [
    "---",
    `name: ${name}`,
    `description: ${when}`,
    "---",
    "",
    `# ${name}`,
    "",
    "The owner showed these steps once in the browser. Follow them in order. If a page looks different, look for the button or field with the same name. If you cannot find it, stop and ask the owner instead of guessing.",
    "",
    "## Steps",
    "",
    ...lines.map((line, index) => `${index + 1}. ${line}`),
    "",
  ].join("\n");
}
