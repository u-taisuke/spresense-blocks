# 新しいブロックパックを追加する

カメラ・GNSS・LTE・BLE など、新しいハードウェア機能をブロックとして追加するときの手順です。
既存のパック(`packages/block-packs/core-io`)を参考にしてください。

## 1. パッケージを作る

[packages/block-packs/\_template](../packages/block-packs/_template) をコピーして
リネームするのが一番早い(ひな形になっている。詳しくは`_template/README.md`を参照)。
手で一から作る場合は、次の構成にする。

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
  **制御構文**(繰り返し・条件分岐など)は `CONTROL_STRUCTURE`(濃いオレンジ)を、
  「◯ミリ秒待つ」のようなそれ単体で完結する簡単な制御ブロックは `CONTROL`
  (通常のオレンジ)を使う。同じカテゴリ内でも「入れ物になるブロックかどうか」が
  ひと目で分かるようにするため。

## 3. コード生成を書く (`generators.ts`)

- **`registerGenerators(generator: Blockly.Generator, builder: SketchBuilder)` という関数を export する。**
  `new Blockly.Generator(...)` をパック側で作らないこと。アプリ全体では
  (core-io・sensor-addonなど複数パックのブロックが同じワークスペースに混在するため)
  共有の `Blockly.Generator` インスタンスが1つだけ存在し、各パックはそこに
  自分の `forBlock` を登録するだけ、という役割分担になっている
  (合成は `apps/editor/src/renderer/src/codegen.ts` が行う)。
  `scrub_`(次ブロックへの連結の設定)もそちらの責任なので、パック側では設定しない。
- 生成関数自体は「このブロック1個分のコード(文字列、または値ブロックなら `[式, 優先順位]`)」を
  返すだけにする。
- `#include` が必要なら `builder.addInclude(...)`、初期化コードが必要なら
  `builder.addSetup(重複排除キー, コード)` を **副作用として** 呼ぶ。
  同じキーで複数回呼んでも1回しか出力されないので、同じ機能を使うブロックが複数あっても安全。
- 最終的な `.ino` の組み立て(`SketchBuilder`)は Blockly非依存なので、パック側で作り直す必要はない。
- 複数ステートメントを連結するブロック(繰り返しブロックなど)を作る場合は、
  [architecture.md](./architecture.md) の `scrub_` の節を必ず読むこと
  (Blockly の既定動作では次ブロックへの連結が自動で行われない)。
- **C++のクラス定義を生成コードに含めたい場合、`builder.addFunction()` は使わないこと。**
  `SketchBuilder.build()` の出力順は include → グローバル変数 → setup/loop → 関数(`addFunction`)の順で
  固定されており、`addFunction` の内容は常に一番最後に出力される。そのためグローバル変数の初期化
  (`SomeClass instance;` のような行)でそのクラスを使うと、クラス定義より前に使われてコンパイルエラーに
  なる。クラスがどうしても必要な初期化(チャタリング防止のあるボタン入力など)は、instrumentパック
  (`packages/block-packs/instrument`)のように、状態を持つグローバル変数(`int`など)と `if` 文だけで
  同じロジックをインライン展開することで回避できる。
- パック単体でのテスト・動作確認用に、`registerGenerators` を呼び出して単体で完結する
  `generateSketch(workspace, builder)` も一緒に export しておくとよい(既存パックを参照)。
  値ブロックしか持たないパック(sensor-addonなど)は、テストでは `generator.forBlock[type]` を
  直接呼び出して返り値と `builder.build()` の副作用を確認すればよい
  (`sensor-addon/test/generators.test.ts` を参照)。

## 4. ツールボックス・コード生成をアプリに登録する

`toolbox.json` はカテゴリ定義の**配列**として書く(1パックが複数カテゴリを持ってもよい)。
`colour` の値は `blocks.ts` で使った `BlockCategoryColour` の値と一致させること(JSONからは
TypeScriptの定数を直接参照できないため、手で合わせる必要がある)。

`apps/editor/src/renderer/src/BlocklyWorkspace.tsx` で `installXxxMessages()` /
`installXxxBlocks()` を呼び、`toolbox.contents` に `...パック名Categories` をスプレッドで追加する。
`apps/editor/src/renderer/src/codegen.ts` で `registerXxxGenerators(generator, builder)` を
1行呼ぶ。どちらも既存パックの登録行をコピーすればよい。

もしパックが Arduino Library Manager や GitHub 上のライブラリ(BMI160Gen など)を必要とするなら、
`packages/board-spresense` に `LibraryDependency` の配列としてデータを足し(`sensorAddon.json`
のような専用JSONを新設し)、`packages/board-spresense/src/index.ts` の `allBlockPackLibraries`
にスプレッドで加える。これ1箇所の更新だけで、アプリ本体の自動セットアップ
(`apps/editor/src/main/setup.ts`)とCI(`scripts/ci-install-arduino-deps.mjs`)の両方に反映される。
git-url でのインストールは必ずコミットハッシュを固定すること(`packages/board-spresense/sensorAddon.json`
を参照)。

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

## 7. CIサンプルに追加する(推奨)

`apps/editor/test/generate-ci-samples.test.ts` の `SAMPLES` に、新しいパックを使った
代表的なブロック構成を1つ追加しておくと、CI(`.github/workflows/ci.yml`)が毎回
実際に `arduino-cli compile` でコンパイル確認してくれるようになる。アプリ本体と同じ
`codegen.ts` 経由で生成するため、パック単体のテストでは気づけない「他パックとの合成で
壊れる」類の回帰も検知できる。

## 8. UIを目で確認する(新しいツールバーボタンやパネルを追加した場合)

`.claude/skills/run-desktop/` に、Playwrightの `_electron` でこのElectronアプリを
実際に起動・操作するためのドライバーとその使い方をまとめてある。ツールボックスの
フライアウト内のブロック操作は合成イベントでは不安定なため避け、ボタン・モーダル・
フォームなどトップレベルのUI要素の動作確認に使うこと。
