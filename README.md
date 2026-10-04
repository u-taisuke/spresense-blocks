# Spresense Blocks

SPRESENSE を、Scratch や MakeCode のようにブロックを組み立てるだけでプログラムできるようにする、
ローカル動作のデスクトップアプリ(Electron)です。高校生・初学者が Arduino IDE の C++ を書かずに
SPRESENSE を動かせることを目標にしています。

設計の全体像はリポジトリ内のコメント・ディレクトリ構成に沿って追えるようにしています。
特に「新しい機能(センサーやカメラなど)を追加しやすいか」を最重要視した設計です。詳しくは
[docs/architecture.md](./docs/architecture.md) と [docs/adding-a-block-pack.md](./docs/adding-a-block-pack.md)
を参照してください。今後の開発計画は [docs/roadmap.md](./docs/roadmap.md) にまとめています。
開発に参加する方は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

**初めて使う生徒・先生の方は [docs/tutorial.md](./docs/tutorial.md) を見てください。**
`samples/` フォルダにすぐ試せるサンプルプログラム(`.sprsb`)も用意しています。

## 現在の状況

**Phase 0〜5(MVP)が完了しました。** 以下が実機(SPRESENSEメインボード)で動作確認済みです。

- ブロック編集 → コード生成 → `arduino-cli` によるコンパイル・書き込みが一気通貫で動く
- 制御(繰り返し・もし〜なら・待つ)・動作(LED・デジタル出力・PWM出力)・センシング(デジタル/アナログ入力)・
  演算(比較)・変数・拡張センサー(加速度・気圧・温度)・ゆる楽器(高さ・長さ・大きさを指定して単音/和音を鳴らす)、の7カテゴリ・19ブロック
  - 「ゆる楽器」はSony公式の[ssprocLib](https://github.com/SonySemiconductorSolutions/ssih-music)
    (Sound Signal Processing Library for Spresense)を使用
- プロジェクトの保存/読込(`.sprsb`)
- USBポートの自動検出・自動選択
- **`arduino-cli` 本体・SPRESENSEコア・ブロックパックが必要とする追加ライブラリの自動ダウンロード・
  インストール**(初回起動時のみ。以降はネットワーク不要)。Windows インストーラーからそのまま使える
- 「ゆる楽器」用の音源(ピアノ・サックス、各2オクターブ)をアプリに同梱。倍音合成で作った
  オリジナル音源(著作権が不明瞭な録音素材は使っていない)を、ツールバーの
  ツールバーの「音源コピー」からSDカードへコピーできる(SPRESENSE本体はUSB接続時にSDカードを
  ドライブとして公開しないため、SDカードを一度取り外してPCに挿す運用が前提)
- Windowsインストーラーは管理者権限なしでインストールできる(`perMachine: false`、
  UAC昇格プロンプトなし)。学校PCなど、管理者権限を持たないユーザーでも使える設計
- 読み取り専用・シンタックスハイライト付きの「コードを見る」パネル(生成されたC++の確認用)

拡張センサー・ゆる楽器のどちらも実機(センサー値・実際の音出し)での動作確認はこれから
(センサー拡張ボード・SDカードへの音源ファイル配置が必要なため。詳しくは
[docs/roadmap.md](./docs/roadmap.md) を参照)。

## 使う人向け(教員・生徒)

**[Releases](https://github.com/u-taisuke/spresense-blocks/releases/latest) から Windows
インストーラー(`.exe`)をダウンロードして実行するだけで使えます**(ビルド不要、管理者権限不要)。
初回起動時に `arduino-cli` と SPRESENSE のボード情報を自動でダウンロード・セットアップします
(数分かかることがあります。2回目以降はネットワーク不要で高速に起動します)。
SPRESENSEが認識されない場合は、アプリ右上の「USBが認識されないときは」からドライバ案内ページを開けます。

コード署名はしていないため、実行時にWindows Defender SmartScreenの警告が出ます。
「詳細情報」→「実行」で進めてください。

自分でインストーラーをビルドしたい場合は、下記「Windows 向けインストーラーの作成」を参照してください。

## 開発者向けセットアップ

- [Node.js](https://nodejs.org/) 20 以上

```bash
npm install
npm run dev
```

`apps/editor` の Electron アプリが起動します(ホットリロード対応)。初回は arduino-cli と
SPRESENSEコアの自動セットアップ画面が表示されます。SPRESENSEをUSB接続した状態で
ポートを選び「書き込む」を押すと、ブロックで組んだプログラムが実機に書き込まれます。

### 開発時に毎回の自動セットアップを省略したい場合

すでに自分の環境に `arduino-cli` とSPRESENSEコアをセットアップ済みなら、環境変数で
そちらを直接指定することで、アプリ内の自動セットアップ(専用データディレクトリへのダウンロード)を
丸ごとスキップできます。

```bash
arduino-cli config add board_manager.additional_urls https://github.com/sonydevworld/spresense-arduino-compatible/releases/download/generic/package_spresense_index.json
arduino-cli core update-index
arduino-cli core install SPRESENSE:spresense

export SPRESENSE_BLOCKS_ARDUINO_CLI_PATH="$(which arduino-cli)"
npm run dev
```

## テスト・型チェック

```bash
npm test         # 各パッケージの単体テスト(Blockly のコード生成ロジックなど)
npm run typecheck # 全パッケージの型チェック
```

CI(`.github/workflows/ci.yml`)では、上記に加えてブロック構成から生成した代表的な
サンプルプロジェクトを実際に `arduino-cli compile` でコンパイルし、「コード生成の
単体テストは通るが、アプリ本体の合成経路(`codegen.ts`)では壊れている」種類の回帰も検知します。

## Windows 向けインストーラーの作成

```bash
npm run dist:win -w @spresense-blocks/editor
```

`apps/editor/release/` に `.exe` インストーラーが生成されます。実行に必要なファイルは
すべてバンドル済みで、`arduino-cli` は初回起動時にアプリが自動でダウンロードします
(コード署名は未対応のため、Windowsの警告が出ます)。

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
