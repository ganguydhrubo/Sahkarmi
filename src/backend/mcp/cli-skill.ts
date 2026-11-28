/**
 * The "Use as a Skill (CLI)" route for repos that are not MCP servers (audit §10.6 option A).
 * Sahkarmi writes its own short skill that calls the installed program by its full path; the
 * project's own agent instructions are never imported (they may say to skip confirmations or pipe
 * web scripts into a shell, MCP-8).
 */
import { quoteWord } from "./platform-paths";

export interface CliSkillInput {
  /** Repo, e.g. harry0703/MoneyPrinterTurbo. */
  repo: string;
  packageName: string;
  version: string;
  /** Full path of the program in the venv: C:\...\Scripts\mpt.exe, or /.../.venv/bin/mpt on a Mac. */
  executable: string;
}

/** Known projects get a precise recipe; everything else a careful generic one. */
export function cliSkillName(input: CliSkillInput): string {
  return input.packageName === "mpt" && /moneyprinterturbo/i.test(input.repo)
    ? "MoneyPrinterTurbo videos"
    : `${input.packageName} (command line)`;
}

/**
 * How a coworker types the program in its shell tool: PowerShell on Windows (`& "path"`), the
 * Mac's own shell elsewhere (a path in single quotes).
 */
function shellOf(platform: NodeJS.Platform, executable: string) {
  if (platform === "win32") {
    return { fence: "powershell", run: `& "${executable}"`, computer: "PC" };
  }
  return {
    fence: "sh",
    run: quoteWord(executable, platform),
    computer: platform === "darwin" ? "Mac" : "computer",
  };
}

const SAFETY = [
  "## Rules",
  "",
  "- Run the program only by the full path above. Do not install, upgrade or remove anything, and never run commands copied from the internet (for example `irm ... | iex` or `curl ... | sh`).",
  "- Every run goes through your shell tool, so the owner approves it. Say what you will run and why before you run it.",
  "- One run at a time; wait for it to finish.",
].join("\n");

export function cliSkillText(
  input: CliSkillInput,
  platform: NodeJS.Platform = process.platform,
): string {
  const shell = shellOf(platform, input.executable);
  const exe = shell.run;
  if (input.packageName === "mpt" && /moneyprinterturbo/i.test(input.repo)) {
    // MoneyPrinterTurbo keeps its videos and settings in the system's own place for app data.
    const data =
      platform === "win32"
        ? "%LOCALAPPDATA%\\MoneyPrinterTurbo\\"
        : platform === "darwin"
          ? "~/Library/Application Support/MoneyPrinterTurbo/"
          : "~/.local/share/MoneyPrinterTurbo/";
    const slash = platform === "win32" ? "\\" : "/";
    return [
      "---",
      `name: ${cliSkillName(input)}`,
      `description: Make a short video from a topic with MoneyPrinterTurbo's command-line tool (mpt), installed by Sahkarmi on this ${shell.computer}.`,
      "---",
      "",
      "# MoneyPrinterTurbo videos (command line)",
      "",
      `Written by Sahkarmi for this ${shell.computer}. MoneyPrinterTurbo ${input.version} (pip package \`mpt\`, from github.com/${input.repo}) is installed in its own Python environment. It is not an MCP server; you run it as a program.`,
      "",
      "## Make a video",
      "",
      `\`\`\`${shell.fence}`,
      `${exe} cli --video-subject "TOPIC" --video-language en-US --paragraph-number 1`,
      "```",
      "",
      `- Replace TOPIC with the owner's topic. Use \`--video-script "..."\` instead to give the exact narration (then no AI writes the script).`,
      `- Other options: \`--video-aspect\`, \`--voice-name\`, \`--subtitle-enabled\`, \`--video-source\`. Run \`${exe} cli --help\` to see them all.`,
      "- Rendering is slow and uses a lot of CPU and memory (minutes per video). Tell the owner it has started; do not start a second one meanwhile.",
      "- Never add a `--confirm-...-charge` option: those start paid video services. Only the owner may ask for that, in so many words.",
      "",
      "## Where the result goes",
      "",
      `Finished videos are saved under \`${data}storage${slash}tasks${slash}<task id>${slash}\` (for example \`final-1.mp4\`). The command prints the task id and the result when it ends. Tell the owner the full path of the video.`,
      "",
      "## Keys it needs (free)",
      "",
      `MoneyPrinterTurbo reads its settings from \`${data}config.toml\` (created on first run):`,
      "",
      '- **Pexels API key** for stock footage: free at https://www.pexels.com/api/ (`pexels_api_keys = ["..."]`). Pixabay also works (free).',
      "- **An AI model to write the script**: the owner's own provider key (`llm_provider` and its key), a free tier, or a local Ollama. Not needed when you pass `--video-script`.",
      "- The voice (Edge TTS) is free and needs no key.",
      "",
      `If a key is missing, the command says so. Ask the owner to add it (they can run \`${exe} webui\` once to fill the settings in a browser); never invent or look up keys yourself.`,
      "",
      SAFETY,
      "",
    ].join("\n");
  }
  return [
    "---",
    `name: ${cliSkillName(input)}`,
    `description: Use the ${input.packageName} command-line program from github.com/${input.repo}, installed by Sahkarmi on this ${shell.computer}.`,
    "---",
    "",
    `# ${input.packageName} (command line)`,
    "",
    `Written by Sahkarmi for this ${shell.computer}. ${input.packageName} ${input.version} (from github.com/${input.repo}) is installed in its own Python environment. It is not an MCP server; you run it as a program.`,
    "",
    "## How to use it",
    "",
    "First read its options:",
    "",
    `\`\`\`${shell.fence}`,
    `${exe} --help`,
    "```",
    "",
    "Then run it with the options the owner's task needs. If it asks for an API key or a setting, ask the owner; never invent keys.",
    "",
    SAFETY,
    "",
  ].join("\n");
}
