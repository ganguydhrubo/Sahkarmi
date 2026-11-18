/**
 * Home's "AI brain". A job typed or spoken on Home is often short, misspelt, in mixed languages
 * or heard wrongly by the microphone. Fixed rules cannot read that; the coworker's own AI can.
 * So the job goes to the coworker with this note in front: say what you understood first, ask
 * only what cannot be guessed, and pass the job on when another coworker suits it better.
 * The owner's chat still shows only their own words.
 */
export function understandFirstPrompt(text: string, options: { canHandOver: boolean }): string {
  return [
    "[Note from Sahkarmi. This is not from the owner.]",
    "The owner typed or spoke the job below on the Home screen. They run a small business and are not a technical person. The words may be in English, Hindi, Bengali or a mix, in any script, with spelling mistakes or words a microphone heard wrongly.",
    "Do this, in order:",
    '1. Work out what the owner wants. Begin your reply with ONE short line, in the owner\'s own language, that starts with the words for "I understood:" and says the job in plain words.',
    "2. If something you cannot sensibly decide yourself is missing (a name, an amount, a date, a file), ask at most two short questions and stop there. Do not ask about things you can decide.",
    options.canHandOver
      ? "3. If another coworker in this team suits the job better, hand it to them with sahkarmi.send_message and tell the owner in one line who is doing it. Otherwise do the job yourself."
      : "3. Otherwise do the job.",
    "Never make up facts, prices, names or dates.",
    "--- the owner's words ---",
    text,
  ].join("\n");
}
