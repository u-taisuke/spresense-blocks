---
name: run-desktop
description: Build, run, and drive the Spresense Blocks Electron desktop app (apps/editor). Use when asked to start the desktop app, take a screenshot of it, or interact with its UI (Blockly workspace, toolbar buttons, SDカードパネル等) without a human at the keyboard.
---

Spresense Blocks (`apps/editor`)はWindowsネイティブで動くElectronアプリ。
エージェント/自動操作からは Playwright の `_electron` で直接操作する
(xvfbは不要。Windows上でそのまま動く)。

## ビルド

```bash
npm run build -w @spresense-blocks/editor
```

`apps/editor/out/` が生成される。ソースを変更したら再ビルドが必要。

## 実行(エージェント向け)

`playwright-core` は `apps/editor` の devDependencies に入っている。
REPLドライバーは `.claude/skills/run-desktop/driver.mjs`(プロジェクトルートから実行する。
`node_modules` 解決のため、スクリプトはリポジトリ内から実行すること)。

```bash
node .claude/skills/run-desktop/driver.mjs
```

`launch` → `ss <name>` → `click-text "ボタンの文字"` のように対話的にコマンドを送る
(標準入力に1行ずつコマンドを書く)。tmuxが無い環境では、ワンショットのNodeスクリプトを
直接書いて `_electron.launch()` を呼ぶほうが確実(下記例)。

```javascript
import { _electron as electron } from "playwright-core";
const app = await electron.launch({
  executablePath: "<repo>/node_modules/electron/dist/electron.exe",
  args: ["<repo>/apps/editor"],
  env: { ...process.env, SPRESENSE_BLOCKS_ARDUINO_CLI_PATH: "dummy-path-for-ui-testing" },
});
const page = app.windows()[0] ?? (await app.firstWindow());
await page.waitForLoadState("domcontentloaded");
// page.evaluate(...) でDOM操作、page.screenshot({path})でスクショ
await app.close();
```

**`SPRESENSE_BLOCKS_ARDUINO_CLI_PATH` 環境変数を必ず設定すること。** 設定しないと
起動直後に実際の arduino-cli ダウンロード(SetupScreen)が走り、UIテストが重く/不安定になる。
ダミー値(実在しないパス)を渡せば、初回セットアップはスキップされすぐEditor画面に入る
(`arduino:listBoards` 等の呼び出しはENOENTで失敗するが、ビルドログパネルにエラーが出るだけで
UIの他の部分には影響しない)。

### Commands(driver.mjsのREPL)

| command | what it does |
|---|---|
| `launch` | launch the app, wait for windows |
| `ss [name]` | screenshot -> `.tmp-shots/<name>.png`(`SCREENSHOT_DIR`で変更可) |
| `click <css-sel>` | click element (via DOM) |
| `click-text <text>` | click button/link containing text |
| `type <text>` / `press <key>` | keyboard input |
| `wait <css-sel>` | wait for element, 10s timeout |
| `eval <js>` | evaluate in the page, print JSON |
| `text [css-sel]` | print innerText |
| `windows` | list all windows |
| `quit` | close app, exit |

### Linux(クラウド環境など)で動かす場合

Windows以外でも、`xvfb-run` を使えば同じ方法で起動・スクリーンショットができる
(2026-10-04 確認)。`executablePath` は `node_modules/electron/dist/electron`(`.exe` 無し)にし、
`args` の先頭に `--no-sandbox` を付ける。

```bash
xvfb-run -a -s "-screen 0 1700x900x24" node <リポジトリ内に置いたスクリプト>.mjs
```

- `page.setViewportSize({ width: 1366, height: 800 })` で、学校PCに多い画面幅での見え方を確認できる。
- 「開く」のファイルダイアログは、mainプロセス側で差し替えればサンプルを読み込める:
  `await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, samplePath);`
- ツールボックスのカテゴリは、Playwrightの実マウス操作(`elementHandle.click()`)ならフライアウトが開いた
  (DOMの `click()`/`dispatchEvent` では開かない)。

## 実行(人間向け)

```bash
npm run dev
```

ホットリロード付きで起動する。

## Gotchas

- **Blockly のツールボックス(フライアウト)は合成マウスイベントでは開きにくい。**
  `page.evaluate()` 経由のDOMクリックや `dispatchEvent` では Blockly 内部のフライアウト
  開閉ロジックが確実に反応しない場合がある(既知の制約、docs/roadmap.md 参照)。
  ツールボックス内のブロックそのものを操作するテストは避け、単体テスト(vitest)や
  実際の `arduino-cli compile` で検証するほうが確実。トップレベルのボタン・モーダル・
  フォーム操作(本ドライバーが対象とするもの)は問題なく動く。
- **独自に `app.whenReady()` を待つ自作スクリプト(dynamic importでmain/index.jsを読み込む等)は
  この環境で `app.whenReady()` が極端に遅延する/返ってこないことがあった。** 原因は未特定だが、
  Playwrightの `_electron.launch()` を使えば(プロセスを正しく子プロセスとして起動するため)
  問題なく動く。自前のElectron起動ハックより `_electron` を使うこと。
- **`node_modules` 解決のため、ドライバー/検証スクリプトはリポジトリ内から実行すること。**
  `/tmp` やスクラッチディレクトリに置いたスクリプトから `playwright-core` を直接importすると
  `ERR_MODULE_NOT_FOUND` になる。
