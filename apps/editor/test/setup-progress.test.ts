import { describe, expect, it } from "vitest";
import { summarizeProgressDetail } from "../src/renderer/src/setupProgress";

describe("summarizeProgressDetail", () => {
  it("進捗バーの \\r で上書きされる行は、最後の状態だけを出す", () => {
    expect(summarizeProgressDetail("gcc 10.0 MiB / 139.9 MiB  7%\rgcc 20.0 MiB / 139.9 MiB  14%\r")).toBe(
      "gcc 20.0 MiB / 139.9 MiB 14%"
    );
  });

  it("色付けの制御文字を取り除く", () => {
    expect(summarizeProgressDetail("\x1b[32mDownloaded\x1b[0m spresense-tools\n")).toBe("Downloaded spresense-tools");
  });

  it("改行や空白だけの断片は空文字", () => {
    expect(summarizeProgressDetail("\r\n  \n")).toBe("");
  });

  it("長すぎる行は切り詰める", () => {
    const result = summarizeProgressDetail("x".repeat(300));
    expect(result).toHaveLength(101);
    expect(result.endsWith("…")).toBe(true);
  });
});
