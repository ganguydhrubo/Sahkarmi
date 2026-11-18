import path from "node:path";
import type { PermissionCategory } from "../shared/ipc";
import { type PermissionRequest, redact } from "./permission-policy";

/** What each kind of paused action means, in words an owner can judge at a glance. */
const WANTS_TO: Record<PermissionCategory, string> = {
  research: "look something up",
  file_read: "read files on your computer",
  file_create: "create a file",
  file_modify: "change a file",
  file_delete: "delete files",
  shell: "run a command on your computer",
  browser_navigation: "open a web page",
  browser_interaction: "click or type on a web page",
  desktop_control: "see your screen and use the mouse and keyboard in your apps",
  downloads: "download a file",
  external_messages: "send a message to someone outside Sahkarmi",
  publication: "publish or post something online",
  business_actions: "submit or confirm something on a website",
  payments: "make a payment",
  account_settings: "change an account setting",
  official_forms: "submit an official form",
  app_updates: "install an app update",
};

/** What really changes once the owner says yes. */
const IF_APPROVED: Record<PermissionCategory, string> = {
  research: "it will look this up and use the answer in its work. Your files are not changed.",
  file_read: "it can see what is in these files and use it in its work. They are not changed.",
  file_create: "a new file will be saved on your computer.",
  file_modify: "the file will be changed, and its old content may be replaced.",
  file_delete: "the files will be removed and may not be recoverable.",
  shell: "this runs on your computer at once. Commands can change files or settings.",
  browser_navigation: "the page opens in its browser, and the site sees a normal visit.",
  browser_interaction: "it will do this on the page, just as if you had done it yourself.",
  desktop_control:
    "until Sahkarmi restarts it can see your screen and click, type and open apps on this PC, just as if you were at the keyboard. It never types passwords and cannot touch Sahkarmi's own window.",
  downloads: "the file will be saved on your computer.",
  external_messages: "the message is sent straight away and cannot be taken back.",
  publication: "it goes live straight away, and other people can see it.",
  business_actions:
    "this is done for real. It may send an application or place, change or cancel something.",
  payments: "money may leave your account.",
  account_settings: "this changes how your account works.",
  official_forms: "your information goes to an official body, and that may be hard to undo.",
  app_updates: "the update is installed, and the app may restart.",
};

/** Clicks in these categories send what the page holds, not only the click. */
const SENDS_PAGE_CONTENT = new Set<PermissionCategory>([
  "external_messages",
  "publication",
  "business_actions",
  "payments",
  "account_settings",
  "official_forms",
]);

const FILE_IN_TEXT =
  /(?:[A-Za-z]:)?[\w\-./\\ ]*?[\w-]+\.(?:md|txt|csv|xlsx?|json|js|ts|py|env|pdf|docx?|html?|png|jpe?g)\b/gi;

/** Fields whose typed value is never repeated on a card or in Telegram. */
const PRIVATE_FIELD =
  /pass|otp|one.?time|\bpin\b|cvv|cvc|card|secret|token|aadhaar|\bpan\b|\bssn\b|\bupi\b/i;

/** File names the action touches: known paths first, then names spotted in the command text. */
function mentionedFiles(request: PermissionRequest): string[] {
  const found = request.paths.length
    ? request.paths
    : [...request.action.matchAll(FILE_IN_TEXT)].map((match) => match[0].trim());
  return [...new Set(found.map((file) => path.basename(file.replaceAll("\\", "/"))))].slice(0, 5);
}

function placeOf(
  request: PermissionRequest,
  roots: { shared: string; own: string | null },
): string {
  const text = `${request.paths.join(" ")} ${request.action}`.replaceAll("\\", "/").toLowerCase();
  const inside = (root: string | null) =>
    root !== null && root !== "" && text.includes(root.replaceAll("\\", "/").toLowerCase());
  if (inside(roots.own)) return "its own work folder";
  if (inside(roots.shared)) return "your Shared folder";
  if (request.paths.length || /[a-z]:\//.test(text)) return "a folder outside Sahkarmi";
  return "";
}

function siteOf(url: string): string {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/** A browser step as an owner would say it: the site's real name and the button's own words. */
function browserPhrase(request: PermissionRequest, files: string[]): string | null {
  const browser = request.browser;
  if (!browser) return null;
  const site = siteOf(browser.url);
  const on = site ? `on ${site}` : "on a web page";
  const label = browser.label ? `"${browser.label.slice(0, 80)}"` : "";
  if (browser.type === "open") {
    return site ? `open ${site} in its browser` : "open a web page in its browser";
  }
  if (browser.type === "upload") {
    return `attach ${files.join(", ") || "a file from your computer"} to a form ${on}`;
  }
  const how =
    browser.type === "click"
      ? `pressing ${label || "a button"}`
      : browser.type === "type"
        ? `typing into ${label || "the page"}`
        : browser.type === "paste"
          ? "pasting text into the page"
          : browser.type === "key"
            ? "pressing a key"
            : "using the page";
  switch (request.category) {
    case "payments":
      return `make a payment ${on} by ${how}`;
    case "business_actions":
      return `submit or confirm something ${on} by ${how}`;
    case "publication":
      return `publish or post something ${on} by ${how}`;
    case "external_messages":
      return `send a message ${on} by ${how}`;
    case "account_settings":
      return `change an account setting ${on} by ${how}`;
    case "official_forms":
      return `submit an official form ${on} by ${how}`;
    default:
      return `work ${on} by ${how}`;
  }
}

/** What a script or command is for, judged from what it uses; first match wins. */
const PURPOSES: Array<[RegExp, string]> = [
  [
    /\b(os\.remove|os\.unlink|shutil\.rmtree|rmSync|unlinkSync|Remove-Item|rmdir|rm\s+-r?f?)\b|\bdel\s+\//i,
    "delete files",
  ],
  [/\b(smtplib|sendmail|nodemailer|Send-MailMessage)\b/i, "send an email"],
  [/\b(openpyxl|xlsxwriter|xlrd|read_excel|to_excel)\b|\.xlsx?\b/i, "make or read an Excel sheet"],
  [/\b(docx|python-docx|Document\()|\.docx\b/i, "make or change a Word file"],
  [/\b(reportlab|fpdf|pdfkit|PyPDF2?|pypdf|fitz|pdfplumber)\b|\.pdf\b/i, "make or read a PDF"],
  [/\b(pptx|python-pptx)\b|\.pptx\b/i, "make a slide deck"],
  [/\b(matplotlib|plotly|seaborn|chart)\b/i, "draw a chart"],
  [/\b(PIL|Image\.open|sharp|cv2)\b|\.(png|jpe?g|webp)\b/i, "work with a picture"],
  [/\b(csv|read_csv|to_csv)\b|\.csv\b/i, "work with a CSV sheet"],
  [/\b(requests\.|urllib|httpx|fetch\(|axios)/i, "get information from a website"],
  [/\b(json\.(load|dump)|JSON\.parse|readFile|open\()/i, "read or write a file"],
  [/\bprint\(|console\.log\(/i, "work something out and show the answer"],
];

/** The plain purpose of a script's text, or null when nothing tells. */
export function scriptPurpose(text: string): string | null {
  return PURPOSES.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** A shell step that can lose data or change the PC itself; it gets a "be careful" line. */
const RISKY_COMMAND =
  /\b(os\.remove|shutil\.rmtree|rmSync|unlinkSync|Remove-Item|rmdir|format|diskpart|reg\s+(add|delete)|Set-ExecutionPolicy|shutdown|net\s+user|takeown|icacls|bcdedit|schtasks|Stop-Process|taskkill|git\s+push\s+(-f|--force)|git\s+reset\s+--hard)\b|\brm\s+-[rf]|\bdel\s+\/|\bgit\s+clean\b/i;

/** Commands that only list or read files; every part of the line must be one of these. */
const LOOK_ONLY =
  /^(?:Get-ChildItem|Get-Content|Get-Item|Test-Path|Select-String|Get-Location|ls|dir|cat|type|pwd|head|tail|wc|find|tree|rg|grep|echo|Write-Output|Resolve-Path|Measure-Object|Select-Object|Sort-Object|Format-List|Format-Table|Out-String|if|else)\b/i;

/** True when a shell line only lists or reads files (dir, Get-Content, cat, ...). */
export function isLookOnlyCommand(command: string): boolean {
  const unquoted = command.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
  if (
    />|\b(Set-|Remove-|New-|Move-|Copy-|Rename-|Invoke-|Start-|Stop-|Add-|Clear-|Out-File)/i.test(
      unquoted,
    )
  ) {
    return false;
  }
  const parts = unquoted
    .split(/&&|\|\||[;&|\r\n{}()]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return (
    parts.length > 0 &&
    parts.every(
      (part) => LOOK_ONLY.test(part) || (/^[-$\w.:\\/"' ]+$/.test(part) && !/\s/.test(part)),
    )
  );
}

/** Commands an owner meets often, said plainly. Anything else stays "a command". */
function commandPhrase(command: string): string {
  const text = command.trim();
  const site = text.match(/https?:\/\/[^\s"'`]+/)?.[0];
  const host = site ? siteOf(site) : "";
  if (/^\s*(py|python3?)(\.exe)?\s+-c\b/i.test(text)) {
    const purpose = scriptPurpose(text);
    return purpose
      ? `run a small Python script on your computer to ${purpose}`
      : "run a small Python script on your computer";
  }
  if (/^\s*(node|bun)(\.exe)?\s+(-e|--eval)\b/i.test(text)) {
    const purpose = scriptPurpose(text);
    return purpose
      ? `run a small script on your computer to ${purpose}`
      : "run a small script on your computer";
  }
  if (/^\s*(powershell|pwsh)(\.exe)?\b/i.test(text)) {
    const purpose = scriptPurpose(text);
    return purpose
      ? `run a Windows command on your computer to ${purpose}`
      : "run a Windows command on your computer";
  }
  if (isLookOnlyCommand(text)) return "look at the files in its work folder (nothing is changed)";
  const script = text.match(/^\s*(?:py|python3?|node|bun)(?:\.exe)?\s+"?([^\s"]+\.\w+)/i)?.[1];
  if (script) return `run the script ${path.basename(script.replaceAll("\\", "/"))}`;
  if (/\bgit\s+push\b/i.test(text)) return "send code changes to an online code repository";
  if (/\bgit\s+commit\b/i.test(text)) return "save code changes in a project's history";
  if (/\b(npm|pnpm|yarn|bun|pip3?)\s+(install|add|i)\b/i.test(text)) {
    return "install extra software on your computer";
  }
  if (/\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b/i.test(text)) {
    return host ? `contact ${host} from your computer` : "contact a website from your computer";
  }
  return WANTS_TO.shell;
}

function actionPhrase(request: PermissionRequest, files: string[], place: string): string {
  const browser = browserPhrase(request, files);
  if (browser) return browser;
  const named = files.join(", ");
  const where = place ? ` in ${place}` : "";
  switch (request.category) {
    case "shell":
      return commandPhrase(request.action);
    case "research": {
      const site = siteOf(request.action);
      if (site) return `look at ${site}`;
      return request.action.includes(" ")
        ? `look up "${request.action.slice(0, 80)}"`
        : WANTS_TO.research;
    }
    case "file_read":
      return named ? `read ${named}${where}` : WANTS_TO.file_read;
    case "file_create":
      return named ? `create ${named}${where}` : WANTS_TO.file_create;
    case "file_modify":
      return named ? `change ${named}${where}` : WANTS_TO.file_modify;
    case "file_delete":
      return named ? `delete ${named}${where}` : WANTS_TO.file_delete;
    default:
      return WANTS_TO[request.category] ?? "do something that needs your OK";
  }
}

function sharedLine(request: PermissionRequest, files: string[]): string | null {
  const browser = request.browser;
  if (!browser) return null;
  const site = siteOf(browser.url);
  const to = site || "the website";
  if (browser.type === "upload") {
    return `What is shared: ${files.join(", ") || "the chosen file"} goes to ${to}.`;
  }
  if (browser.text?.trim()) {
    return PRIVATE_FIELD.test(browser.label)
      ? `What is shared: the private text it typed goes to ${to}. It is not shown here.`
      : `What is shared: "${redact(browser.text, 160)}" goes to ${to}.`;
  }
  return SENDS_PAGE_CONTENT.has(request.category)
    ? `What is shared: whatever is filled in on this page goes to ${to}.`
    : null;
}

/**
 * How many separate commands a shell line holds (`a && b`, `a; b`, `a | b`, one per line),
 * ignoring separators inside quotes. A plain card must say when a command does more than one.
 */
export function commandCount(command: string): number {
  const unquoted = command.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
  return unquoted.split(/&&|\|\||[;&|\r\n]/).filter((part) => part.trim() !== "").length;
}

function chainedLine(request: PermissionRequest): string | null {
  if (request.category !== "shell") return null;
  const count = commandCount(request.detail || request.action || "");
  if (count < 2) return null;
  return count === 2
    ? "Note: this also runs a second command. Open the technical details to see both."
    : `Note: this runs ${count} commands one after another. Open the technical details to see each one.`;
}

/** Categories that are everyday steps: reading, looking up, saving a new file. */
const EVERYDAY = new Set<PermissionCategory>([
  "research",
  "file_read",
  "file_create",
  "browser_navigation",
  "downloads",
]);

/**
 * "Is this normal?": a plain answer for someone who cannot read the command. Everyday steps say
 * so; steps that can lose data, spend money or reach other people say to allow them only if
 * expected, and how to ask first.
 */
export function normalLine(request: PermissionRequest, botName: string): string | null {
  const command = `${request.detail || ""} ${request.action || ""}`;
  if (request.category === "shell") {
    if (isLookOnlyCommand(request.detail || request.action || "")) {
      return "Is this normal? Yes. It only looks at files so it knows what is there; nothing is changed.";
    }
    if (RISKY_COMMAND.test(command)) {
      return `Is this normal? Only if you expected it: this can delete things or change how your computer works. If you are not sure, press Reject and ask ${botName} to explain in the chat.`;
    }
    return "Is this normal? Yes. Coworkers often run small commands and scripts like this to make files and check their work. It is safe to allow when it matches what you asked for.";
  }
  if (EVERYDAY.has(request.category)) return "Is this normal? Yes, this is an everyday step.";
  if (request.category === "file_modify") {
    return "Is this normal? Yes, when you asked for this file to be updated. If not, press Reject.";
  }
  if (
    request.category === "file_delete" ||
    request.category === "payments" ||
    request.category === "external_messages" ||
    request.category === "publication" ||
    request.category === "official_forms"
  ) {
    return `Is this normal? Only if you asked for it. This cannot easily be undone, so if you are not sure, press Reject and ask ${botName} first.`;
  }
  return null;
}

function whyLine(request: PermissionRequest, ownerAsked: string | null): string {
  if (request.reason?.trim()) return `Why: ${redact(request.reason, 300)}`;
  if (ownerAsked?.trim()) {
    return `Why: it is working on what you asked for: "${redact(ownerAsked, 160)}"`;
  }
  return "Why: this kind of action is set to need your OK before it happens.";
}

/** Turns a paused tool call into a plain-language approval card plus folded technical detail. */
export function describePermissionRequest(
  request: PermissionRequest,
  botName: string,
  roots: { shared: string; own: string | null },
  ownerAsked: string | null = null,
): { title: string; details: string; technical: string } {
  const files = mentionedFiles(request);
  const place = placeOf(request, roots);
  const phrase = actionPhrase(request, files, place);
  const lines = [
    `${botName} is asking your permission to ${phrase}.`,
    whyLine(request, ownerAsked),
    request.browser?.type === "upload"
      ? "If you approve: a copy of the file leaves your computer and goes to that website."
      : `If you approve: ${IF_APPROVED[request.category] ?? "it will go ahead with this."}`,
    sharedLine(request, files),
    chainedLine(request),
    normalLine(request, botName),
    `Nothing happens until you choose. If you reject, ${botName} will not do this.`,
  ];
  return {
    title: `${botName} wants to ${phrase}`,
    details: lines.filter(Boolean).join("\n"),
    // The whole command, line breaks kept: a second command hidden after a newline or a long
    // first line must be visible to the owner before they say yes.
    technical: request.detail || request.action || request.category,
  };
}

const MIN_TITLE_WORDS = 4;
const MIN_DETAILS_CHARS = 100;

export const APPROVAL_TOOL_DESCRIPTION =
  "Ask the owner to approve an action BEFORE doing it: payments or money movement, sending anything to customers/vendors, publishing, submitting applications, government or bank forms, deleting data, or sharing personal data. Write for someone who is not technical and cannot see your work. Returns immediately; the decision arrives later as a message.";

export const APPROVAL_TITLE_HELP =
  'One plain sentence saying what you will do and where, e.g. "Send your job application to ABC Technologies". Never a label like "Job Apply Once" or "Submit for Confirming".';

export const APPROVAL_DETAILS_HELP =
  '100 to 500 characters of everyday English, more if truly needed. Say: what you will do; why; which company, website or service is involved; what happens if the owner approves; and what information or content is sent or shared. Name real things, and use no ids, tool names or jargon. Example: "I want to send your job application to ABC Technologies through its careers website, because it matches the roles you asked me to apply for. Your resume and application details will be shared with the company, and the application can\'t be recalled once sent."';

/** Why a coworker's request cannot go to the owner yet; null when it explains itself. */
export function approvalRequestProblem(title: string, details: string): string | null {
  if (
    title.trim().split(/\s+/).length >= MIN_TITLE_WORDS &&
    details.trim().length >= MIN_DETAILS_CHARS
  ) {
    return null;
  }
  return `Not sent to the owner: this request does not explain itself. Call request_approval again. title: ${APPROVAL_TITLE_HELP} details: ${APPROVAL_DETAILS_HELP} Do not perform the action.`;
}
