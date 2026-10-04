# アーキテクチャ概要

## 全体の流れ

```
Blockly ワークスペース
   │  (ユーザーがブロックを組む)
   ▼
各ブロックの生成関数 (packages/block-packs/*/src/generators.ts)
   │  ・include / setup / loop の断片を SketchBuilder に書き込む
   │  ・戻り値としてこのブロック自身の1行(loop用)を返す
   ▼
SketchBuilder (packages/codegen-core)
   │  ・重複するinclude/setup行を排除し、1つの .ino ソースにまとめる
   ▼
Electron preload 経由で main プロセスへ (apps/editor/src/preload)
   ▼
ArduinoCliClient (packages/arduino-cli-bridge)
   │  ・一時ディレクトリにスケッチを書き出す
   │  ・arduino-cli compile / upload をサブプロセスとして実行
   ▼
SPRESENSE 実機
```

## なぜこの分割にしたか

- **SketchBuilder は Blockly を一切importしない。**
  そのため `packages/codegen-core` は Node の単体テストだけで検証でき、
  「このブロック構成なら、このC++が出る」という契約を Blockly のレンダリングなしに保証できる。
  将来「生成コードを見る」パネルを追加するときも `SketchBuilder.build()` の出力をそのまま
  表示すればよい。

- **ボード定義(`packages/board-spresense`)はデータ(JSON)として分離してある。**
  FQBNやピン名をブロックのコードに直接埋め込まず、`board.json` / `pins.json` を経由して
  参照する。ボードの世代交代やピン配列の変更があっても、ブロック定義そのものは変えずに
  すむ設計になっている。

- **arduino-cli の呼び出しは `packages/arduino-cli-bridge` に一本化してある。**
  Electron のレンダラーから直接サブプロセスを起動することはない
  (`contextIsolation: true` / `nodeIntegration: false` で明示的に禁止している)。
  すべて `apps/editor/src/preload` の narrow API 経由で main プロセスに依頼する。
  また同時に2つ以上のコマンドを実行できないようにしている(ビルドキャッシュ破損防止)。

- **arduino-cli本体・SPRESENSEコア・追加ライブラリは、アプリが自動でダウンロード・インストールする。**
  (`packages/arduino-cli-bridge/src/installer.ts` の `ArduinoCliInstaller`)。すべて
  Electronの `userData` 配下の専用ディレクトリに閉じ込め、ユーザーが元々持っている
  Arduino IDE 環境には一切触れない。ブロックパックが追加のライブラリを必要とする場合は
  `packages/board-spresense` に `LibraryDependency` として登録し、
  `packages/board-spresense` の `allBlockPackLibraries`(全パック分をまとめた単一の配列)に
  足す(詳しくは [adding-a-block-pack.md](./adding-a-block-pack.md) を参照)。
  `apps/editor/src/main/setup.ts`(アプリ本体の自動セットアップ)と
  `scripts/ci-install-arduino-deps.mjs`(CI)の両方がこの1つの配列だけを見るので、
  新しいライブラリを追加するときの更新箇所が1箇所で済む。

- **機能ごとに「ブロックパック」として分離してある。**
  詳しくは [adding-a-block-pack.md](./adding-a-block-pack.md) を参照。

- **生成されたC++コードを見る、読み取り専用・シンタックスハイライト付きのコードビューがある。**
  右パネルの「C++コード」タブ(ツールバーの「コード」ボタン、または `Ctrl+Shift+C` でも
  「メッセージ」タブと切り替えられる)に生成コードが表示される。シンタックスハイライトは `highlight.js` を
  使っており、オフライン環境でも動くようCDNからではなくアプリにバンドルしている
  (`blockly-media` と同じ考え方)。実装は `apps/editor/src/renderer/src/CodeView.tsx`
  (タブの切り替え自体は `App.tsx`)。

## Blockly のコード生成で気をつけていること

**`Blockly.Generator` のインスタンスはアプリ全体で1つだけ。** 複数のブロックパック
(core-io・sensor-addonなど)のブロックが同じワークスペースに混在するため、各パックが
それぞれ `new Blockly.Generator(...)` してはいけない。各パックは `registerGenerators(generator, builder)`
という関数だけを export し、`apps/editor/src/renderer/src/codegen.ts` がその1つの共有インスタンスに
全パック分の `forBlock` をまとめて登録する。パックを追加するたびに、この合成ファイルに
1行足すだけでよい設計になっている。

`Blockly.Generator` の既定の `scrub_` はコードをそのまま返すだけで、
「次に接続されたブロックのコードをつなげる」処理は自動では行われない
(JavaScript/Python 等の言語別ジェネレータが各自 `scrub_` でこれを実装している)。
そのため `codegen.ts` の共有ジェネレータ生成時に、`scrub_` で次ブロックへの連結を
明示的に実装している(各パックの `generateSketch`(パック単体テスト用)も同様に自前で設定する)。

また `blockly/core` はコアのみを含み、組み込みブロック・組み込み言語ジェネレータ・
英語メッセージは含まれない(それらは `blockly` パッケージ全体を使う場合のみ入る)。
本プロジェクトは独自ブロック・独自ジェネレータしか使わないため `blockly/core` で十分だが、
Blockly自身のUIメッセージ(右クリックメニュー等)は `blockly/msg/ja` を読み込んで
`Blockly.setLocale()` で明示的に日本語化している。

Google のデモサーバー(`blockly-demo.appspot.com`)から効果音・画像を読み込む既定動作は、
オフラインのローカル環境という要件に反するため、`node_modules/blockly/media` を
`apps/editor/src/renderer/public/blockly-media/` に同梱し、`Blockly.inject` の `media` オプションで
ローカルパスを指すようにしている。
