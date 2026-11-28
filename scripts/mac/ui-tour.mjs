#!/usr/bin/env node
// Uses a running Sahkarmi like an owner would, over the Chrome DevTools Protocol, and saves a
// picture of every step. It runs on GitHub's Mac machines (see install-test.sh) because the
// release is made without a Mac at hand. It also works on Windows and Linux.
//
// Usage: node scripts/mac/ui-tour.mjs <debug port> <output folder>

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const port = Number(process.argv[2] ?? 9461);
const out = process.argv[3] ?? "mac-test-output";
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function findPage() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find(
        (target) => target.type === "page" && !target.url.startsWith("devtools://"),
      );
      if (page) return page;
    } catch {
      // The app is still starting.
    }
    await sleep(1_000);
  }
  throw new Error(`No Sahkarmi window answered on port ${port}.`);
}

class Session {
  #socket;
  #nextId = 1;
  #waiting = new Map();
  problems = [];

  static async open(url) {
    const session = new Session();
    session.#socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      session.#socket.addEventListener("open", resolve, { once: true });
      session.#socket.addEventListener("error", () => reject(new Error("CDP socket failed")), {
        once: true,
      });
    });
    session.#socket.addEventListener("message", (event) => session.#onMessage(event));
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    await session.send("Log.enable");
    return session;
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
      this.problems.push(
        `exception: ${details.exception?.description ?? details.text ?? "unknown"}`.slice(0, 600),
      );
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      this.problems.push(`console error: ${message.params.entry.text}`.slice(0, 600));
    }
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#waiting.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

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
  }

  async shot(name) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(out, `${name}.png`), Buffer.from(data, "base64"));
    console.log(`  picture: ${name}.png`);
  }

  text() {
    return this.evaluate("document.body.innerText");
  }

  close() {
    this.#socket.close();
  }
}

const page = await findPage();
console.log(`window: ${page.title} (${page.url})`);
const session = await Session.open(page.webSocketDebuggerUrl);
await sleep(3_000);
await session.shot("tour-01-start");
const text = await session.text();
writeFileSync(join(out, "tour-01-start.txt"), text);
console.log(text.slice(0, 1_500));
const facts = await session.evaluate(`JSON.stringify({
  platform: navigator.platform,
  userAgent: navigator.userAgent,
  width: innerWidth,
  height: innerHeight,
  buttons: [...document.querySelectorAll("button")].slice(0, 80).map((b) => (b.getAttribute("aria-label") || b.innerText || "").trim().slice(0, 40)),
})`);
writeFileSync(join(out, "tour-facts.json"), facts);
console.log(facts);
if (session.problems.length > 0) {
  console.log("Problems seen in the window:");
  for (const problem of session.problems) console.log(`  ${problem}`);
}
session.close();
