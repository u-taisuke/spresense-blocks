import { afterEach, describe, expect, it } from "vitest";
import { getPlatformAsset } from "../src/installer.js";

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
