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

- **機能ごとに「ブロックパック」として分離してある。**
  詳しくは [adding-a-block-pack.md](./adding-a-block-pack.md) を参照。

## Blockly のコード生成で気をつけていること

`Blockly.Generator` の既定の `scrub_` はコードをそのまま返すだけで、
「次に接続されたブロックのコードをつなげる」処理は自動では行われない
(JavaScript/Python 等の言語別ジェネレータが各自 `scrub_` でこれを実装している)。
そのため独自の Arduino 用ジェネレータでも、`scrub_` で次ブロックへの連結を明示的に実装する
必要がある(`packages/block-packs/core-io/src/generators.ts` を参照)。

また `blockly/core` はコアのみを含み、組み込みブロック・組み込み言語ジェネレータ・
英語メッセージは含まれない(それらは `blockly` パッケージ全体を使う場合のみ入る)。
本プロジェクトは独自ブロック・独自ジェネレータしか使わないため `blockly/core` で十分だが、
Blockly自身のUIメッセージ(右クリックメニュー等)は `blockly/msg/ja` を読み込んで
`Blockly.setLocale()` で明示的に日本語化している。

Google のデモサーバー(`blockly-demo.appspot.com`)から効果音・画像を読み込む既定動作は、
オフラインのローカル環境という要件に反するため、`node_modules/blockly/media` を
`apps/editor/src/renderer/public/blockly-media/` に同梱し、`Blockly.inject` の `media` オプションで
ローカルパスを指すようにしている。
