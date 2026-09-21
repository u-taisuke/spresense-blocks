# 新しいブロックパックを追加する

カメラ・GNSS・LTE・BLE など、新しいハードウェア機能をブロックとして追加するときの手順です。
既存のパック(`packages/block-packs/core-io`)を参考にしてください。

## 1. パッケージを作る

```
packages/block-packs/<パック名>/
  package.json
  tsconfig.json
  toolbox.json          # ツールボックスのカテゴリ定義(名前・色・ブロック一覧)
  src/
    blocks.ts            # Blockly.defineBlocksWithJsonArray によるブロック定義
    generators.ts         # ブロック → SketchBuilder への書き込み
    index.ts
    locales/
      ja.json             # このパックで使う日本語メッセージ
```

`package.json` の `dependencies` に `@spresense-blocks/codegen-core`、
`@spresense-blocks/block-shared`(配色ルール、後述)、
`@spresense-blocks/board-spresense`(ピン名などが必要な場合)を追加してください。

## 2. ブロックを定義する (`blocks.ts`)

- `Blockly.defineBlocksWithJsonArray` を使い、JSON宣言でブロックを定義する。
- ラベルは直接文字列を書かず、`locales/ja.json` にキーを用意して `%{BKY_キー名}` で参照する
  (将来の多言語対応のため)。
- ピン番号など基板依存の値は `@spresense-blocks/board-spresense` の `pins` からドロップダウンの
  選択肢を組み立てる。ブロック定義に直接ハードコードしない。
- **色(`colour`)は必ず `@spresense-blocks/block-shared` の `BlockCategoryColour` から選ぶ。**
  数値を直接書かない。Scratch のように「制御」「動作」「センシング」「音」でブロックの色を
  分けることで、初めて触る子供でもひと目でブロックの種類を区別できるようにするための
  ルールなので、新しい色をここで増やさず、既存のカテゴリに当てはめること
  (どうしても既存カテゴリに当てはまらない場合のみ、`block-shared` 側にカテゴリを追加する)。
- 「制御」カテゴリの中でも、`input_statement`(中に他のブロックを入れる入れ物)を持つ
  **制御構文**(くり返し・条件分岐など)は `CONTROL_STRUCTURE`(濃いオレンジ)を、
  「◯ミリ秒待つ」のようなそれ単体で完結する簡単な制御ブロックは `CONTROL`
  (通常のオレンジ)を使う。同じカテゴリ内でも「入れ物になるブロックかどうか」が
  ひと目で分かるようにするため。

## 3. コード生成を書く (`generators.ts`)

- 生成関数は「このブロック1個分のコード(文字列)」を返すだけにする。
- `#include` が必要なら `builder.addInclude(...)`、初期化コードが必要なら
  `builder.addSetup(重複排除キー, コード)` を **副作用として** 呼ぶ。
  同じキーで複数回呼んでも1回しか出力されないので、同じ機能を使うブロックが複数あっても安全。
- ワークスペース全体を走査してブロックをコードに変換する部分(`generateSketch`)は
  `codegen-core` の `SketchBuilder` を使い回すだけで、パック側で作り直す必要はない。
- 複数ステートメントを連結するブロック(繰り返しブロックなど)を作る場合は、
  [architecture.md](./architecture.md) の `scrub_` の節を必ず読むこと
  (Blockly の既定動作では次ブロックへの連結が自動で行われない)。

## 4. ツールボックスに登録する

`toolbox.json` はカテゴリ定義の**配列**として書く(1パックが複数カテゴリを持ってもよい)。
`colour` の値は `blocks.ts` で使った `BlockCategoryColour` の値と一致させること(JSONからは
TypeScriptの定数を直接参照できないため、手で合わせる必要がある)。
`apps/editor/src/renderer/src/BlocklyWorkspace.tsx` の `toolbox.contents` に
`...パック名Categories` の形でスプレッドして追加する(既存パックの登録行をコピーすればよい)。

## 5. テストを書く

`packages/block-packs/core-io/test/generators.test.ts` を参考に、
「このブロック構成なら、この C++ コードが出る」ことを検証する単体テストを追加する。
Blockly はヘッドレスの `new Blockly.Workspace()` + `Blockly.serialization.workspaces.load(...)`
で実際にブロックを組み立てられるので、DOM やレンダリングは不要。

## 6. (推奨) 実機コンパイルの確認

新しいブロックが Spresense Audio ライブラリのような特殊な初期化を必要とする場合は、
実際に `arduino-cli compile --fqbn SPRESENSE:spresense:spresense` に通して
コンパイルが通ることを確認してから統合すること。特にSDカードに追加ファイルが必要な機能
(音声デコーダ等)は、コンパイルが通っても実機で動かない罠があるので注意。
