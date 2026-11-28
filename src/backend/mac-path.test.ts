import { describe, expect, it } from "vitest";
import {
  mergePaths,
  pathFromShellOutput,
  useTerminalPathOnMac,
  usualMacToolFolders,
} from "./mac-path";

describe("Mac PATH from the owner's Terminal", () => {
  it("keeps the current folders first and adds each new folder once", () => {
    expect(mergePaths("/usr/bin:/bin", ["/opt/homebrew/bin", "/bin", "", " /usr/bin "], ":")).toBe(
      "/usr/bin:/bin:/opt/homebrew/bin",
    );
  });

  it("reads the PATH between the marks and ignores what the shell prints around it", () => {
    const output =
      "Welcome back!\n__SAHKARMI_PATH_START__/opt/homebrew/bin:/usr/bin__SAHKARMI_PATH_END__\nbye";
    expect(pathFromShellOutput(output)).toBe("/opt/homebrew/bin:/usr/bin");
    expect(pathFromShellOutput("no marks here")).toBeNull();
    expect(pathFromShellOutput("__SAHKARMI_PATH_START____SAHKARMI_PATH_END__")).toBeNull();
  });

  it("adds the Terminal folders on a Mac", async () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin", SHELL: "/bin/zsh" };
    const calls: string[] = [];
    const path = await useTerminalPathOnMac({
      platform: "darwin",
      env,
      home: "/Users/asha",
      run: async (file) => {
        calls.push(file);
        return "__SAHKARMI_PATH_START__/Users/asha/.nvm/versions/node/v24/bin:/usr/bin__SAHKARMI_PATH_END__";
      },
    });
    expect(calls).toEqual(["/bin/zsh"]);
    expect(path).toBe(env.PATH);
    const folders = (env.PATH ?? "").split(":");
    expect(folders.slice(0, 2)).toEqual(["/usr/bin", "/bin"]);
    expect(folders).toContain("/opt/homebrew/bin");
    expect(folders).toContain("/Users/asha/.local/bin");
    expect(folders).toContain("/Users/asha/.nvm/versions/node/v24/bin");
    expect(new Set(folders).size).toBe(folders.length);
  });

  it("still adds the usual folders when the shell fails", async () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
    await useTerminalPathOnMac({
      platform: "darwin",
      env,
      home: "/Users/asha",
      run: async () => {
        throw new Error("shell profile is broken");
      },
    });
    expect(env.PATH?.split(":")).toEqual(["/usr/bin", ...usualMacToolFolders("/Users/asha")]);
  });

  it("changes nothing on Windows", async () => {
    const env: NodeJS.ProcessEnv = { PATH: "C:\\Windows" };
    expect(await useTerminalPathOnMac({ platform: "win32", env })).toBeNull();
    expect(env.PATH).toBe("C:\\Windows");
  });
});
