import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArduinoCliInstaller, getPlatformAsset, needsLibraryInstall } from "../src/installer.js";

describe("getPlatformAsset", () => {
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  function setPlatform(platform: string, arch: string): void {
    Object.defineProperty(process, "platform", { value: platform });
    Object.defineProperty(process, "arch", { value: arch });
  }

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    Object.defineProperty(process, "arch", { value: originalArch });
  });

  it("resolves the Windows 64bit zip asset", () => {
    setPlatform("win32", "x64");
    const asset = getPlatformAsset("1.5.1");
    expect(asset.archiveFormat).toBe("zip");
    expect(asset.url).toBe(
      "https://github.com/arduino/arduino-cli/releases/download/v1.5.1/arduino-cli_1.5.1_Windows_64bit.zip"
    );
  });

  it("resolves the macOS ARM64 tar.gz asset", () => {
    setPlatform("darwin", "arm64");
    const asset = getPlatformAsset("1.5.1");
    expect(asset.archiveFormat).toBe("tar.gz");
    expect(asset.url).toBe(
      "https://github.com/arduino/arduino-cli/releases/download/v1.5.1/arduino-cli_1.5.1_macOS_ARM64.tar.gz"
    );
  });

  it("resolves the Linux x64 tar.gz asset", () => {
    setPlatform("linux", "x64");
    const asset = getPlatformAsset("1.5.1");
    expect(asset.url).toContain("Linux_64bit.tar.gz");
  });

  it("throws a helpful error for an unsupported platform", () => {
    setPlatform("sunos", "x64");
    expect(() => getPlatformAsset("1.5.1")).toThrow(/この環境/);
  });
});

describe("needsLibraryInstall", () => {
  const ssproc = {
    name: "Sound Signal Processing Library for Spresense",
    gitUrl: "https://example.com/ssih-music.git#new",
  };
  const bmp280 = { name: "Adafruit BMP280 Library", libraryManagerName: "Adafruit BMP280 Library" };

  it("installs a library that is not installed yet", () => {
    expect(needsLibraryInstall(ssproc, [], {})).toBe(true);
    expect(needsLibraryInstall(bmp280, [], {})).toBe(true);
  });

  it("skips a git library already installed from the same pinned URL", () => {
    expect(needsLibraryInstall(ssproc, [ssproc.name], { [ssproc.name]: ssproc.gitUrl })).toBe(false);
  });

  it("reinstalls a git library when the pinned URL changed", () => {
    expect(
      needsLibraryInstall(ssproc, [ssproc.name], { [ssproc.name]: "https://example.com/ssih-music.git#old" })
    ).toBe(true);
  });

  it("reinstalls a git library installed by an older app version (no record yet)", () => {
    expect(needsLibraryInstall(ssproc, [ssproc.name], {})).toBe(true);
  });

  it("skips a Library Manager library once it is installed", () => {
    expect(needsLibraryInstall(bmp280, [bmp280.name], {})).toBe(false);
  });
});

describe("ArduinoCliInstaller library installation", () => {
  const board = { coreId: "SPRESENSE:spresense", coreVersion: "3.4.7", boardManagerUrl: "https://example.com", arduinoCliVersion: "1.5.1" };
  const lib = { name: "Sound Signal Processing Library for Spresense", gitUrl: "https://example.com/ssih-music.git#new" };
  let appDataDir = "";

  afterEach(() => {
    if (appDataDir) {
      rmSync(appDataDir, { recursive: true, force: true });
    }
  });

  /** private な ensureLibrariesInstalled を、arduino-cli を起動しない偽のクライアントで呼ぶ。 */
  function runEnsureLibraries(installedNames: string[], install: () => Promise<void>, messages: string[]): Promise<void> {
    appDataDir = mkdtempSync(join(tmpdir(), "spresense-blocks-test-"));
    const installer = new ArduinoCliInstaller(appDataDir, board) as unknown as {
      ensureLibrariesInstalled(client: unknown, libraries: unknown[], onProgress: (e: { message: string }) => void): Promise<void>;
    };
    const client = {
      getInstalledLibraryNames: async () => installedNames,
      installLibraryFromGit: install,
      installLibrary: install,
    };
    return installer.ensureLibrariesInstalled(client, [lib], (e) => messages.push(e.message));
  }

  it("records the pinned URL after a successful install", async () => {
    await runEnsureLibraries([], async () => {}, []);
    const pins = JSON.parse(readFileSync(join(appDataDir, "library-pins.json"), "utf8"));
    expect(pins[lib.name]).toBe(lib.gitUrl);
  });

  it("keeps going with the old version when updating an installed library fails (e.g. offline)", async () => {
    const messages: string[] = [];
    await expect(
      runEnsureLibraries([lib.name], async () => {
        throw new Error("network unreachable");
      }, messages)
    ).resolves.toBeUndefined();
    expect(messages.some((m) => m.includes("更新に失敗しました"))).toBe(true);
  });

  it("fails when a library that is not installed yet cannot be installed", async () => {
    await expect(
      runEnsureLibraries([], async () => {
        throw new Error("network unreachable");
      }, [])
    ).rejects.toThrow("network unreachable");
  });
});
