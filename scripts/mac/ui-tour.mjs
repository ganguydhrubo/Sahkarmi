#!/usr/bin/env node
// Uses a running Sahkarmi like a new owner would, over the Chrome DevTools Protocol, and saves a
// picture of every step: language, the three welcome questions, Home, every main screen, and one
// real job for the free built-in AI. It runs on GitHub's Mac machines (see install-test.sh)
// because the release is made without a Mac at hand. It also works on Windows and Linux.
//
// Usage: node scripts/mac/ui-tour.mjs <debug port> <output folder>
// TOUR_AI=optional  -> a missing AI answer is reported but does not fail the tour.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const port = Number(process.argv[2] ?? 9461);
const out = process.argv[3] ?? "mac-test-output";
const aiOptional = process.env.TOUR_AI === "optional";
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const failures = [];
let step = 0;

async function findPage() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find(
        (target) => target.type === "page" && target.url.startsWith("sahkarmi-app://"),
      );
      if (page) return page;
    } catch {
      // The app is still starting.
    }
    await sleep(1_000);
  }
  throw new Error(`No Sahkarmi window answered on port ${port}.`);
}

/** Things that went wrong inside the window (uncaught errors, console errors). */
const problems = [];

class Connection {
  #socket;
  #nextId = 1;
  #waiting = new Map();
  closed = false;

  static async open(url) {
    const connection = new Connection();
    connection.#socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      connection.#socket.addEventListener("open", resolve, { once: true });
      connection.#socket.addEventListener("error", () => reject(new Error("CDP socket failed")), {
        once: true,
      });
    });
    connection.#socket.addEventListener("message", (event) => connection.#onMessage(event));
    connection.#socket.addEventListener("close", () => {
      connection.closed = true;
      for (const { reject } of connection.#waiting.values())
        reject(new Error("The window closed its debug connection."));
      connection.#waiting.clear();
    });
    await connection.send("Runtime.enable");
    await connection.send("Page.enable");
    await connection.send("Log.enable");
    return connection;
  }

  #onMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id && this.#waiting.has(message.id)) {
      const { resolve, reject } = this.#waiting.get(message.id);
      this.#waiting.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      problems.push(
        `exception: ${details.exception?.description ?? details.text ?? "unknown"}`.slice(0, 600),
      );
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      problems.push(`console error: ${message.params.entry.text}`.slice(0, 600));
    }
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("The debug connection is closed."));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiting.delete(id);
        reject(new Error(`${method} got no answer in 20 s.`));
      }, 20_000);
      this.#waiting.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.closed = true;
    try {
      this.#socket.close();
    } catch {
      // Already gone.
    }
  }
}

/**
 * The window, reached again by itself when it reloads (it does after the language is chosen):
 * every call gets a fresh connection when the old one is gone or does not answer.
 */
const session = {
  connection: null,
  problems,

  async send(method, params) {
    let lastError;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        if (!this.connection || this.connection.closed) {
          const page = await findPage();
          this.connection = await Connection.open(page.webSocketDebuggerUrl);
        }
        return await this.connection.send(method, params);
      } catch (error) {
        lastError = error;
        this.connection?.close();
        this.connection = null;
        await sleep(1_500);
      }
    }
    throw lastError;
  },

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    }
    return result.result.value;
  },

  async shot(name) {
    step += 1;
    const file = `tour-${String(step).padStart(2, "0")}-${name}.png`;
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(out, file), Buffer.from(data, "base64"));
    console.log(`  picture: ${file}`);
  },

  text() {
    return this.evaluate("document.body.innerText");
  },

  /** Waits until the window shows the words; returns false when they never come. */
  async waitForText(words, seconds = 30) {
    for (let waited = 0; waited < seconds * 2; waited += 1) {
      if ((await this.text()).includes(words)) return true;
      await sleep(500);
    }
    return false;
  },

  /** Clicks the first button whose label or words match; returns the matched words or null. */
  click(words, { exact = false } = {}) {
    return this.evaluate(`(() => {
      const wanted = ${JSON.stringify(words)};
      const label = (button) =>
        (button.getAttribute("aria-label") || button.innerText || "").trim();
      const button = [...document.querySelectorAll("button")].find((candidate) => {
        if (candidate.disabled) return false;
        const text = label(candidate);
        return ${exact ? "text === wanted" : "text.includes(wanted)"};
      });
      if (!button) return null;
      button.scrollIntoView({ block: "center" });
      button.click();
      return label(button);
    })()`);
  },

  close() {
    this.connection?.close();
  },
};

function fail(message) {
  failures.push(message);
  console.log(`  FAILED: ${message}`);
}

async function must(promise, message) {
  const value = await promise;
  if (!value) fail(message);
  return Boolean(value);
}

const page = await findPage();
console.log(`window: ${page.title} (${page.url})`);
await sleep(4_000);

const facts = JSON.parse(
  await session.evaluate(`JSON.stringify({
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    width: innerWidth,
    height: innerHeight,
    platformAttribute: document.documentElement.dataset.platform ?? null,
    language: document.documentElement.lang,
  })`),
);
writeFileSync(join(out, "tour-facts.json"), JSON.stringify(facts, null, 2));
console.log(facts);
const onMac = /Mac/i.test(facts.platform);

/**
 * Presses a button until the next screen shows. A press that reloads the window can lose its
 * own answer, so the proof is the next screen, not what the press returned.
 */
async function pressUntil(button, nextWords, seconds = 40) {
  for (let waited = 0; waited < seconds; waited += 3) {
    await session.click(button);
    if (await session.waitForText(nextWords, 3)) return true;
  }
  return false;
}

console.log("1. First start: choose the language");
if (await session.waitForText("Continue →", 30)) {
  // The wheel turns for a moment before it rests on the computer's own language.
  for (let waited = 0; waited < 20; waited += 1) {
    if ((await session.evaluate("document.documentElement.lang")) === "en") break;
    await sleep(500);
  }
  await session.shot("language");
  await must(
    pressUntil("Continue →", "Let us set up Sahkarmi for you"),
    "The language screen did not lead to the welcome questions.",
  );
} else if (!(await session.text()).includes("What do you want done today?")) {
  fail("Neither the language screen nor Home came up.");
}

console.log("2. Welcome: line of work and the free AI");
if (await session.waitForText("Let us set up Sahkarmi for you", 5)) {
  await must(session.click("Shop or trading"), "Could not pick a line of work.");
  await sleep(800);
  await session.shot("welcome");
  await must(
    pressUntil("Continue with OpenCode", "What do you want done today?", 60),
    "The free built-in AI could not be chosen on the welcome screen.",
  );
}

console.log("3. Home");
if (await must(session.waitForText("What do you want done today?", 40), "Home did not open.")) {
  await sleep(1_500);
  await session.shot("home");
  const team = await session.evaluate(
    `document.querySelectorAll("button.bot-row.team-row").length`,
  );
  console.log(`  starter team: ${team} coworkers`);
  if (team < 5) fail(`The starter team has only ${team} coworkers.`);
}

if (onMac) {
  console.log("4. Mac window: room for the red, yellow and green buttons");
  const room = JSON.parse(
    await session.evaluate(`JSON.stringify({
      attribute: document.documentElement.dataset.platform ?? null,
      railPaddingTop: parseFloat(getComputedStyle(document.querySelector(".app-icon-rail") ?? document.body).paddingTop),
    })`),
  );
  console.log(room);
  if (room.attribute !== "darwin") fail("The window does not know it is on a Mac.");
  if (!(room.railPaddingTop >= 40))
    fail("The left rail leaves no room for the Mac window buttons.");
}

console.log("5. Every main screen opens");
const screens = [
  ["Coworkers", "coworkers"],
  ["Team project", "team-project"],
  ["Approvals", "approvals"],
  ["Knowledge", "knowledge"],
  ["Schedules", "schedules"],
  ["Marketplace", "marketplace"],
  ["Help", "help"],
  ["Settings", "settings"],
];
for (const [label, name] of screens) {
  const before = session.problems.length;
  if (!(await session.click(label, { exact: true }))) {
    fail(`No "${label}" button in the rail.`);
    continue;
  }
  await sleep(2_500);
  await session.shot(name);
  const words = (await session.text()).length;
  if (words < 200) fail(`The ${label} screen is almost empty.`);
  if (session.problems.length > before)
    fail(`The ${label} screen threw: ${session.problems.slice(before).join(" | ")}`);
}

console.log("6. A real job for the free built-in AI");
await session.click("Home", { exact: true });
await session.waitForText("What do you want done today?", 20);
const typed = await session.evaluate(`(() => {
  const box = document.querySelector(".home-view textarea") ?? document.querySelector("textarea");
  if (!box) return false;
  box.focus();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(
    box,
    "What is 12 + 30? Answer with the number only.",
  );
  box.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})()`);
if (!typed) fail("Home has no box to type a job in.");
await sleep(1_500);
await session.shot("job-typed");
if (await must(session.click("Start", { exact: true }), "The Start button cannot be pressed.")) {
  let answer = "";
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    answer = await session.evaluate(
      `[...document.querySelectorAll(".message-entry-bot")].map((entry) => entry.innerText).join("\\n")`,
    );
    if (/\b42\b/.test(answer)) break;
    await sleep(2_000);
  }
  await session.shot("job-answer");
  const seconds = Math.round((Date.now() - started) / 1_000);
  if (/\b42\b/.test(answer)) {
    console.log(`  the coworker answered 42 after ${seconds} s`);
  } else {
    const chat = (await session.text()).slice(-900);
    writeFileSync(join(out, "tour-no-answer.txt"), chat);
    const message = `The free AI gave no answer in ${seconds} s. Last words on screen: ${chat.replace(/\s+/g, " ").slice(-300)}`;
    if (aiOptional) console.log(`  NOTE: ${message}`);
    else fail(message);
  }
}

if (session.problems.length > 0) {
  console.log("Problems seen inside the window:");
  for (const problem of session.problems) console.log(`  ${problem}`);
  writeFileSync(join(out, "tour-window-problems.txt"), session.problems.join("\n"));
  const exceptions = session.problems.filter((problem) => problem.startsWith("exception:"));
  if (exceptions.length > 0) fail(`${exceptions.length} uncaught error(s) inside the window.`);
}
session.close();

if (failures.length > 0) {
  console.log(`\nTOUR FAILED (${failures.length}):`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log("\nTOUR PASSED: language, welcome, Home, every main screen and a real AI job.");
