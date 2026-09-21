# Spresense Blocks

SPRESENSE を、Scratch や MakeCode のようにブロックを組み立てるだけでプログラムできるようにする、
ローカル動作のデスクトップアプリ(Electron)です。高校生・初学者が Arduino IDE の C++ を書かずに
SPRESENSE を動かせることを目標にしています。

設計の全体像はリポジトリ内のコメント・ディレクトリ構成に沿って追えるようにしています。
特に「新しい機能(センサーやカメラなど)を追加しやすいか」を最重要視した設計です。詳しくは
[docs/architecture.md](./docs/architecture.md) と [docs/adding-a-block-pack.md](./docs/adding-a-block-pack.md)
を参照してください。今後の開発計画は [docs/roadmap.md](./docs/roadmap.md) にまとめています。

## 現在の状況

Phase 0・Phase 1が完了し、以下が実機(SPRESENSEメインボード)で動作確認済みです。

- ブロック編集 → コード生成 → `arduino-cli` によるコンパイル・書き込みが一気通貫で動く
- 制御(くり返し・もし〜なら・待つ)・動作(LED・デジタル出力・PWM出力)・センシング(デジタル/アナログ入力)・
  演算(比較)・変数、の5カテゴリ・16ブロック
- プロジェクトの保存/読込(`.sprsb`)
- USBポートの自動検出・自動選択

SD再生・センサー拡張ボード等の追加ブロックパックはこれから(詳しくは
[docs/roadmap.md](./docs/roadmap.md) を参照)。

## 必要なもの

- [Node.js](https://nodejs.org/) 20 以上
- `arduino-cli` と SPRESENSE のコア。まだ自動セットアップ(Phase 2)を実装していないため、
  以下のいずれかの方法で手動セットアップしてください。

  ### 方法A: このプロジェクト専用にダウンロードする(システム全体は変更しない)

  ```bash
  mkdir -p tools/arduino-cli
  curl -sL -o /tmp/arduino-cli.zip https://github.com/arduino/arduino-cli/releases/download/v1.5.1/arduino-cli_1.5.1_Windows_64bit.zip
  unzip -o /tmp/arduino-cli.zip -d tools/arduino-cli
  ```

  `tools/arduino-cli/` は `.gitignore` 対象なのでコミットされません。この場合、後述のとおり
  `SPRESENSE_BLOCKS_ARDUINO_CLI_PATH` 環境変数でパスを指定して使います。

  ### 方法B: システムにインストール済みの arduino-cli を使う

  PATH が通っていればそのまま使えます。

  ### どちらの方法でも、SPRESENSEコアのインストールは必要

  ```bash
  arduino-cli config init
  arduino-cli config add board_manager.additional_urls https://github.com/sonydevworld/spresense-arduino-compatible/releases/download/generic/package_spresense_index.json
  arduino-cli core update-index
  arduino-cli core install SPRESENSE:spresense
  ```

  (方法Aの場合は `arduino-cli` の部分を `./tools/arduino-cli/arduino-cli.exe` に読み替えてください)

  Windows で SPRESENSE を認識しない場合は、[Sony公式のUSBドライバ](https://developer.sony.com/develop/spresense/)
  のインストールが必要な場合があります。`arduino-cli board list` で `Spresense` と表示されれば
  認識できています。

## セットアップ

```bash
npm install
```

## 開発時の起動

```bash
# arduino-cli をこのプロジェクト専用にダウンロードした場合(方法A)は、
# 起動前にパスを指定してください。フルパスは環境に合わせて変更すること。
export SPRESENSE_BLOCKS_ARDUINO_CLI_PATH="$(pwd)/tools/arduino-cli/arduino-cli.exe"

npm run dev
```

`apps/editor` の Electron アプリが起動します(ホットリロード対応)。SPRESENSEをUSB接続した状態で
「ポートを更新」→「コンパイル & 書き込み」を押すと、ブロックで組んだプログラムが実機に書き込まれます。

## テスト・型チェック

```bash
npm test         # 各パッケージの単体テスト(Blockly のコード生成ロジックなど)
npm run typecheck # 全パッケージの型チェック
```

## Windows 向けインストーラーの作成

```bash
npm run dist:win -w @spresense-blocks/editor
```

`apps/editor/release/` に `.exe` インストーラーが生成されます(現時点では `arduino-cli` 同梱や
署名は未対応。Phase 2 で対応予定)。

## リポジトリ構成

```
apps/editor/            Electron アプリ本体(main/preload/renderer)
packages/codegen-core/   Blockly非依存のコード組み立て役(SketchBuilder)
packages/board-spresense/ ボード定義(FQBN・ピン配列)をデータとして分離
packages/arduino-cli-bridge/ arduino-cliサブプロセスの唯一の窓口
packages/block-packs/    機能ごとのブロック定義(新機能は新パックを追加するだけ)
```

## ライセンス

[MIT License](./LICENSE)

`apps/editor/src/renderer/public/blockly-media/` 以下は [Google Blockly](https://github.com/google/blockly)
(Apache License 2.0)に同梱されているメディアアセットをそのまま使用しています。
