import { app } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** サンプルの分類。「サンプル・使い方」画面でタグとして表示する。 */
export type SampleCategory = "基本" | "センサー" | "ゆる楽器";

/** samples/samples.json の1件分。 */
export interface SampleInfo {
  /** samples/ フォルダ内のファイル名(例: "01_Lチカ.sprsb")。 */
  file: string;
  title: string;
  description: string;
  /** 必要な機材(例: "ボタン×3、抵抗×3、SDカード、スピーカー")。 */
  hardware: string;
  category: SampleCategory;
}

export interface OpenSampleResult {
  info: SampleInfo;
  data: unknown;
}

/**
 * サンプル(samples/)とチュートリアル(docs/tutorial.md)の同梱場所を解決する。
 *
 * 開発時(`npm run dev`)は `app.getAppPath()` が apps/editor を指すので、リポジトリのルート
 * (2つ上)にある samples/ と docs/ をそのまま読む(リポジトリの内容を編集すれば即座に反映される)。
 * パッケージ後は electron-builder の `extraResources`(electron-builder.yml)によって
 * `process.resourcesPath/content/` にコピーされる。
 */
export function resolveContentRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "content");
  }
  return join(app.getAppPath(), "..", "..");
}

/** samples.json を読み込む。壊れている・見つからない場合は例外を投げる。 */
export function loadSampleManifest(contentRoot: string): SampleInfo[] {
  const raw = JSON.parse(readFileSync(join(contentRoot, "samples", "samples.json"), "utf8")) as {
    samples?: SampleInfo[];
  };
  return raw.samples ?? [];
}

/**
 * サンプルを1つ読み込む。
 * レンダラーから届くファイル名は、samples.json に載っているものだけを受け付ける
 * (`../` 等で samples/ の外のファイルを読ませないため)。
 */
export function readSample(contentRoot: string, file: string): OpenSampleResult {
  const info = loadSampleManifest(contentRoot).find((sample) => sample.file === file);
  if (!info) {
    throw new Error(`サンプルが見つかりません: ${file}`);
  }
  const data: unknown = JSON.parse(readFileSync(join(contentRoot, "samples", info.file), "utf8"));
  return { info, data };
}

/** チュートリアル(Markdown)の本文を読み込む。 */
export function readTutorial(contentRoot: string): string {
  return readFileSync(join(contentRoot, "docs", "tutorial.md"), "utf8");
}
