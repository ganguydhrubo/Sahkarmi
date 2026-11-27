import { parseTeachStep, type TeachStep } from "../shared/teach";

/**
 * The small script that watches the owner's clicks and typing while they teach a task. It runs
 * in a world of its own inside the page (the page's scripts cannot see or change it) and reports
 * each step as a console line that starts with a secret word only Sahkarmi knows, so a page
 * cannot slip in steps of its own.
 *
 * What it never reads: the value of a password, code, PIN or card field.
 */
export function teachRecorderScript(nonce: string): string {
  return `(() => {
  if (window.__sahkarmiTeach) return;
  window.__sahkarmiTeach = true;
  const NONCE = ${JSON.stringify(nonce)};
  const clean = (value, max) => String(value == null ? "" : value).replace(/\\s+/g, " ").trim().slice(0, max);
  const send = (step) => { try { console.debug(NONCE + JSON.stringify(step)); } catch (error) {} };
  const labelOf = (el) => {
    let text = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("title") || "";
    if (!text && el.labels && el.labels[0]) text = el.labels[0].innerText;
    if (!text && el.id) { const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (label) text = label.innerText; }
    return clean(text || el.getAttribute("name") || el.id || "", 80);
  };
  const nameOf = (el) => clean(el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("alt") || el.innerText || (el.tagName === "INPUT" ? el.value : "") || "", 80);
  const isSecret = (el) => {
    const hint = ((el.getAttribute("autocomplete") || "") + " " + (el.name || "") + " " + (el.id || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("placeholder") || "")).toLowerCase();
    return el.type === "password" || /one-time-code|cc-|current-password|new-password|otp|passcode|password|\\bpin\\b|cvv|cvc|card|secret|token|aadhaar|\\bpan\\b/.test(hint);
  };
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const el = target && target.closest('a,button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="option"],input[type="submit"],input[type="button"],input[type="checkbox"],input[type="radio"],summary');
    if (!el) return;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || (tag === "a" ? "link" : tag === "input" ? el.type : tag === "summary" ? "section" : "button");
    const name = tag === "input" && (el.type === "checkbox" || el.type === "radio") ? labelOf(el) : nameOf(el);
    if (name) send({ kind: "click", name, role });
  }, true);
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (el instanceof HTMLSelectElement) {
      const option = el.selectedOptions[0];
      send({ kind: "choose", field: labelOf(el), value: clean(option ? option.text : "", 80) });
      return;
    }
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (["hidden", "checkbox", "radio", "file", "submit", "button", "range", "color"].includes(el.type)) return;
    send({ kind: "type", field: labelOf(el), value: isSecret(el) ? null : clean(el.value, 120) });
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) send({ kind: "key", key: "Enter" });
  }, true);
})();`;
}

/** A console line from the page: a step when it carries the secret word, else null. */
export function readTeachLine(message: unknown, nonce: string): TeachStep | null {
  if (typeof message !== "string" || !nonce || !message.startsWith(nonce)) return null;
  try {
    return parseTeachStep(JSON.parse(message.slice(nonce.length)));
  } catch {
    return null;
  }
}
