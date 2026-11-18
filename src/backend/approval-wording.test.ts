import { describe, expect, it } from "vitest";
import type { PermissionCategory } from "../shared/ipc";
import {
  approvalRequestProblem,
  commandCount,
  describePermissionRequest,
  isLookOnlyCommand,
} from "./approval-wording";
import { classifyAcpTool } from "./permission-policy";

const ROOTS = {
  shared: "C:\\Users\\me\\Sahkarmi\\Shared",
  own: "C:\\Users\\me\\Sahkarmi\\Coworkers\\asha",
};

describe("describePermissionRequest", () => {
  it("says in plain words when a command also runs a second one", () => {
    const card = (action: string) =>
      describePermissionRequest(
        { botId: "asha", provider: "codex", category: "shell", action, paths: [] },
        "Asha",
        ROOTS,
      ).details;
    expect(card("dir")).not.toContain("second command");
    expect(card('echo "a && b"')).not.toContain("second command");
    expect(card("dir && del notes.txt")).toContain("also runs a second command");
    expect(card("cd x; npm install; npm test")).toContain("runs 3 commands");
    expect(card("dir\ndel notes.txt")).toContain("second command");
    expect(commandCount("type a.txt | findstr total")).toBe(2);
    expect(commandCount("echo 'x; y'")).toBe(1);
  });

  it("explains a command in plain words and folds the raw command away", () => {
    const action = `python -c "open(r'C:\\Users\\me\\Sahkarmi\\Shared\\gst\\working.md').read()"`;
    const card = describePermissionRequest(
      { botId: "asha", provider: "antigravity", category: "shell", action, paths: [] },
      "Asha",
      ROOTS,
    );
    expect(card.title).toBe(
      "Asha wants to run a small Python script on your computer to read or write a file",
    );
    expect(card.details).toContain("If you approve:");
    expect(card.details).toContain("Is this normal? Yes.");
    expect(card.details).not.toContain("open(r");
    expect(card.technical).toBe(action);
  });

  it("says plainly when a command only looks at files", () => {
    expect(
      isLookOnlyCommand("Get-ChildItem -Force; if (Test-Path AGENTS.md) { Get-Content AGENTS.md }"),
    ).toBe(true);
    expect(isLookOnlyCommand("dir && type notes.txt")).toBe(true);
    expect(isLookOnlyCommand("Get-Content a.txt > b.txt")).toBe(false);
    expect(isLookOnlyCommand("Get-ChildItem; Remove-Item old.txt")).toBe(false);
    expect(isLookOnlyCommand("python make.py")).toBe(false);
    const card = describePermissionRequest(
      {
        botId: "dev",
        provider: "codex",
        category: "shell",
        action: "Get-ChildItem -Force",
        paths: [],
      },
      "Dev",
      ROOTS,
    );
    expect(card.title).toBe(
      "Dev wants to look at the files in its work folder (nothing is changed)",
    );
    expect(card.details).toContain("It only looks at files");
  });

  it("says what a script is for and warns plainly when it can delete things", () => {
    const excel = describePermissionRequest(
      {
        botId: "asha",
        provider: "gemini",
        category: "shell",
        action: "python -c \"import openpyxl; wb = openpyxl.Workbook(); wb.save('sales.xlsx')\"",
        paths: [],
      },
      "Asha",
      ROOTS,
    );
    expect(excel.title).toContain("to make or read an Excel sheet");
    expect(excel.details).toContain("It is safe to allow when it matches what you asked for.");

    const wipe = describePermissionRequest(
      {
        botId: "asha",
        provider: "gemini",
        category: "shell",
        action: "Remove-Item -Recurse C:Usersmeold",
        paths: [],
      },
      "Asha",
      ROOTS,
    );
    expect(wipe.details).toContain("Only if you expected it");
    expect(wipe.details).toContain("ask Asha to explain");
  });

  it("names the site, the button, the reason and what is shared", () => {
    const card = describePermissionRequest(
      {
        botId: "asha",
        provider: "gemini",
        category: "business_actions",
        action: 'click "Apply now" on https://www.naukri.com/job/123?token=abc',
        paths: [],
        browser: { type: "click", label: "Apply now", url: "https://www.naukri.com/job/123?t=abc" },
      },
      "Asha",
      ROOTS,
      "Apply to 20 fresh jobs on Naukri",
    );
    expect(card.title).toBe(
      'Asha wants to submit or confirm something on naukri.com by pressing "Apply now"',
    );
    expect(card.details).toContain(
      'Why: it is working on what you asked for: "Apply to 20 fresh jobs on Naukri"',
    );
    expect(card.details).toContain("whatever is filled in on this page goes to naukri.com");
    expect(card.details).not.toContain("t=abc");
  });

  it("never repeats what was typed into a private field", () => {
    const card = describePermissionRequest(
      {
        botId: "asha",
        provider: "gemini",
        category: "browser_interaction",
        action: 'type "Password"',
        paths: [],
        browser: {
          type: "type",
          label: "Password",
          url: "https://www.naukri.com/",
          text: "hunter2",
        },
      },
      "Asha",
      ROOTS,
    );
    expect(card.details).not.toContain("hunter2");
  });

  it("explains every kind of action in at least 100 characters", () => {
    const categories: PermissionCategory[] = [
      "research",
      "file_read",
      "file_create",
      "file_modify",
      "file_delete",
      "shell",
      "browser_navigation",
      "browser_interaction",
      "desktop_control",
      "downloads",
      "external_messages",
      "publication",
      "business_actions",
      "payments",
      "account_settings",
      "official_forms",
      "app_updates",
    ];
    for (const category of categories) {
      const card = describePermissionRequest(
        { botId: "asha", provider: "claude", category, action: "x", paths: [] },
        "Asha",
        ROOTS,
      );
      expect(card.details.length, category).toBeGreaterThanOrEqual(100);
      expect(card.title, category).not.toContain(category);
    }
  });

  it("warns about money for payments", () => {
    const card = describePermissionRequest(
      {
        botId: "asha",
        provider: "claude",
        category: "payments",
        action: "click Pay now",
        paths: [],
      },
      "Asha",
      ROOTS,
    );
    expect(card.title).toBe("Asha wants to make a payment");
    expect(card.details).toContain("money may leave your account.");
  });
});

describe("approvalRequestProblem", () => {
  const FULL =
    "I want to send your job application to ABC Technologies through its careers website. Your resume will be shared with the company.";

  it("turns away labels and thin details", () => {
    expect(approvalRequestProblem("Job Apply Once", FULL)).toContain("Not sent to the owner");
    expect(
      approvalRequestProblem("Send your application to ABC Technologies", "Please approve."),
    ).toContain("Not sent to the owner");
  });

  it("lets a request that explains itself through", () => {
    expect(approvalRequestProblem("Send your application to ABC Technologies", FULL)).toBeNull();
  });
});

describe("classifyAcpTool", () => {
  it("does not treat Sahkarmi's own tools as shell commands", () => {
    expect(classifyAcpTool(null, "sahkarmi_save_memory", [], {})).toBe("research");
    expect(classifyAcpTool(null, "sahkarmi_request_approval", [], {})).toBe("research");
    expect(classifyAcpTool(null, "something_else", [], {})).toBe("shell");
  });
});
