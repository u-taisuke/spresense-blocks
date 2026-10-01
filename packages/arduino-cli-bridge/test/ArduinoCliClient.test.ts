import { describe, expect, it } from "vitest";
import {
  ArduinoCliClient,
  ArduinoCliExitError,
  parseBoardList,
  parseInstalledCoreVersion,
  parseInstalledLibraryNames,
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

describe("parseInstalledLibraryNames", () => {
  it("extracts library names from installed_libraries", () => {
    const json = JSON.stringify({
      installed_libraries: [
        { library: { name: "Adafruit BMP280 Library" } },
        { library: { name: "BMI160-Arduino" } },
      ],
    });
    expect(parseInstalledLibraryNames(json)).toEqual(["Adafruit BMP280 Library", "BMI160-Arduino"]);
  });

  it("returns an empty list for blank output", () => {
    expect(parseInstalledLibraryNames("")).toEqual([]);
  });

  it("skips entries without a library name", () => {
    const json = JSON.stringify({ installed_libraries: [{ library: {} }, {}] });
    expect(parseInstalledLibraryNames(json)).toEqual([]);
  });
});

describe("ArduinoCliClient コマンドキュー", () => {
  it("同時に呼んでも両方が(即座にbusyで落とされず)実際に実行される", async () => {
    // 実際の arduino-cli の代わりに node 自身を叩く(fullArgsの先頭が実在しないモジュール名
    // "compile"/"upload" になるため、どちらも ArduinoCliExitError で失敗するが、
    // ここで確認したいのは「2つ目の呼び出しが ArduinoCliBusyError 等で即座に拒否されず、
    // 1つ目の完了を待ってから実際にプロセスが起動すること」。
    const client = new ArduinoCliClient(process.execPath);

    const [firstResult, secondResult] = await Promise.allSettled([
      client.compile("sketchDirA", "SPRESENSE:spresense:spresense"),
      client.upload("sketchDirB", "SPRESENSE:spresense:spresense", "COM3"),
    ]);

    expect(firstResult.status).toBe("rejected");
    expect(secondResult.status).toBe("rejected");
    if (firstResult.status === "rejected") {
      expect(firstResult.reason).toBeInstanceOf(ArduinoCliExitError);
    }
    if (secondResult.status === "rejected") {
      expect(secondResult.reason).toBeInstanceOf(ArduinoCliExitError);
    }
  });

  it("1つ目が失敗しても、2つ目はキューされたまま実行される", async () => {
    const client = new ArduinoCliClient(process.execPath);

    const first = client.compile("sketchDirA", "SPRESENSE:spresense:spresense").catch((e) => e);
    const second = client.compile("sketchDirB", "SPRESENSE:spresense:spresense").catch((e) => e);

    const [firstError, secondError] = await Promise.all([first, second]);
    expect(firstError).toBeInstanceOf(ArduinoCliExitError);
    expect(secondError).toBeInstanceOf(ArduinoCliExitError);
  });
});
