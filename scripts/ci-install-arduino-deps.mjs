#!/usr/bin/env node
/**
 * CI(GitHub Actions)上で、SPRESENSEコア＋全ブロックパックが必要とするライブラリを
 * arduino-cli にインストールする。
 *
 * 開発者のPC向けの自動セットアップ(`apps/editor/src/main/setup.ts` /
 * `packages/arduino-cli-bridge/src/installer.ts`)とは別の、CIランナー専用の軽量版。
 * CIランナーは使い捨てなので、開発者PCのような「ユーザーの既存環境から隔離する」
 * (`--config-file` による分離)は不要で、素直にデフォルト設定を使ってよい。
 *
 * ボード情報・ライブラリ一覧は packages/board-spresense 配下のJSONを直接読む
 * (このスクリプトはプレーンなNodeスクリプトとして動かしたいため、TypeScriptパッケージ
 * 経由ではなくJSONを直接参照している。値そのものは `@spresense-blocks/board-spresense`
 * が再エクスポートしているものと同じソース)。
 *
 * 使い方: node scripts/ci-install-arduino-deps.mjs
 * (事前に `arduino-cli` 本体がPATHに入っている必要がある。CIでは
 * `arduino/setup-arduino-cli` アクション等でインストールしておくこと)
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const boardSpresenseDir = join(__dirname, "..", "packages", "board-spresense");

function readJson(name) {
  return JSON.parse(readFileSync(join(boardSpresenseDir, name), "utf8"));
}

const board = readJson("board.json");
const sensorAddon = readJson("sensorAddon.json");
const instrumentAddon = readJson("instrumentAddon.json");
const libraries = [...sensorAddon.libraries, ...instrumentAddon.libraries];

function run(args) {
  console.log(`$ arduino-cli ${args.join(" ")}`);
  execFileSync("arduino-cli", args, { stdio: "inherit" });
}

run(["config", "init", "--overwrite"]);
run(["config", "set", "board_manager.additional_urls", board.boardManagerUrl]);
run(["config", "set", "library.enable_unsafe_install", "true"]);
run(["core", "update-index"]);
run(["core", "install", `${board.coreId}@${board.coreVersion}`]);

for (const lib of libraries) {
  if (lib.gitUrl) {
    run(["lib", "install", "--git-url", lib.gitUrl]);
  } else if (lib.libraryManagerName) {
    run(["lib", "install", lib.libraryManagerName]);
  } else {
    throw new Error(`LibraryDependency "${lib.name}" has neither gitUrl nor libraryManagerName`);
  }
}

console.log("arduino-cli setup complete.");
