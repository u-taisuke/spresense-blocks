import { describe, expect, it } from "vitest";
import {
  ArduinoCliBusyError,
  ArduinoCliClient,
  parseBoardList,
  parseInstalledCoreVersion,
} from "../src/ArduinoCliClient.js";

describe("parseBoardList", () => {
  it("parses the newer `{ detected_ports: [...] }` shape", () => {
    const json = JSON.stringify({
      detected_ports: [
        {
          port: { address: "COM3" },
          matching_boards: [{ name: "Spresense", fqbn: "SPRESENSE:spresense:spresense" }],
        },
        { port: { address: "COM5" }, matching_boards: [] },
      ],
    });

    expect(parseBoardList(json)).toEqual([
      { port: "COM3", boardName: "Spresense", fqbn: "SPRESENSE:spresense:spresense" },
      { port: "COM5", boardName: undefined, fqbn: undefined },
    ]);
  });

  it("parses the older top-level array shape", () => {
    const json = JSON.stringify([
      { address: "COM7", boards: [{ name: "Spresense", fqbn: "SPRESENSE:spresense:spresense" }] },
    ]);

    expect(parseBoardList(json)).toEqual([
      { port: "COM7", boardName: "Spresense", fqbn: "SPRESENSE:spresense:spresense" },
    ]);
  });

  it("returns an empty list for blank output", () => {
    expect(parseBoardList("")).toEqual([]);
  });
});

describe("parseInstalledCoreVersion", () => {
  it("returns the installed_version for a matching platform id", () => {
    const json = JSON.stringify({
      platforms: [
        { id: "arduino:avr", installed_version: "1.8.8" },
        { id: "SPRESENSE:spresense", installed_version: "3.4.7" },
      ],
    });
    expect(parseInstalledCoreVersion(json, "SPRESENSE:spresense")).toBe("3.4.7");
  });

  it("returns null when the platform has no installed_version (not installed)", () => {
    const json = JSON.stringify({ platforms: [{ id: "SPRESENSE:spresense" }] });
    expect(parseInstalledCoreVersion(json, "SPRESENSE:spresense")).toBeNull();
  });

  it("returns null when the platform id is not found at all", () => {
    const json = JSON.stringify({ platforms: [{ id: "arduino:avr", installed_version: "1.8.8" }] });
    expect(parseInstalledCoreVersion(json, "SPRESENSE:spresense")).toBeNull();
  });

  it("returns null for blank output", () => {
    expect(parseInstalledCoreVersion("", "SPRESENSE:spresense")).toBeNull();
  });
});

describe("ArduinoCliClient single-flight guard", () => {
  it("rejects a second call while one is still running", async () => {
    // 実際の arduino-cli の代わりに、少し待ってから終了するだけの Node スクリプトを叩く。
    const client = new ArduinoCliClient(process.execPath);
    const first = client.compile("-e", "SPRESENSE:spresense:spresense").catch(() => {
      // 実引数はダミーなので失敗するが、ここでは「busyにならず受理されたこと」だけ確認できればよい。
    });

    await expect(client.upload("-e", "SPRESENSE:spresense:spresense", "COM3")).rejects.toBeInstanceOf(
      ArduinoCliBusyError
    );

    await first;
  });
});
