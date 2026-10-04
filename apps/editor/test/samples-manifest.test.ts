import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * samples/samples.json(「サンプル・使い方」画面とメニューバーの「サンプル」の元データ)が、
 * samples/ フォルダの .sprsb ファイルと過不足なく対応していることを確かめる。
 * サンプルを追加・名前変更したのに一覧の更新を忘れると、アプリから開けなくなるため。
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SAMPLES_DIR = join(REPO_ROOT, "samples");

interface SampleEntry {
  file: string;
  title: string;
  description: string;
  hardware: string;
  category: string;
}

const manifest = JSON.parse(readFileSync(join(SAMPLES_DIR, "samples.json"), "utf8")) as { samples: SampleEntry[] };
const sampleFiles = readdirSync(SAMPLES_DIR)
  .filter((file) => file.endsWith(".sprsb"))
  .sort();

describe("samples/samples.json", () => {
  it("lists every .sprsb file exactly once, in file-name order", () => {
    expect(manifest.samples.map((sample) => sample.file)).toEqual(sampleFiles);
  });

  it("gives every sample a title, description, hardware and a known category", () => {
    for (const sample of manifest.samples) {
      expect(sample.title, sample.file).not.toBe("");
      expect(sample.description, sample.file).not.toBe("");
      expect(sample.hardware, sample.file).not.toBe("");
      expect(["基本", "センサー", "ゆる楽器"], sample.file).toContain(sample.category);
    }
  });

  it("is linked from the tutorial's sample table", () => {
    const tutorial = readFileSync(join(REPO_ROOT, "docs", "tutorial.md"), "utf8");
    for (const file of sampleFiles) {
      expect(tutorial, file).toContain(`(../samples/${file})`);
    }
  });
});
