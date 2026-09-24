# 開発ロードマップ

現在地と、今後のフェーズの計画です。進捗に応じてこのファイルを更新していきます。

## ✅ Phase 0 — 最小疑似スライス（完了）

- Electronシェル(electron-vite) + Blockly + 「ずっと／オンボードLED点ける・消す／ミリ秒待つ」の3ブロック
- Blockly非依存の `SketchBuilder`(codegen-core)
- `arduino-cli` を使ったコンパイル・書き込み
- **実機のSPRESENSEでLED点滅を確認済み**

## ✅ Phase 1 — core-io 完成 ＋ 永続化（完了）

- [x] COMポートの自動検出・自動選択(当初計画より前倒しで実装)
  - ドロップダウンを開いた瞬間に検索、SPRESENSEを自動選択、後から挿しても自動追従
- [x] ビルドログのストリーム表示パネル
- [x] 任意ピンのデジタル入出力ブロック(D00〜D28、実際の `pins_arduino.h` から確認)
- [x] PWM出力ブロック(`analogWrite`。専用ハードウェアPWMピンはD03/D05/D06/D09だが、
      ソフトウェアPWMで全デジタルピンから選べる)
- [x] アナログ入力ブロック(A0〜A5、`analogRead`で0〜1023)
- [x] プロジェクトの保存/読込(`.sprsb`、`Blockly.serialization.workspaces` を使ったJSON、
      `boardId`+`schemaVersion`つき)
- [x] 変数(自由入力の名前→安全なC++識別子に自動変換)・条件分岐(もし〜なら)・
      繰り返し(N回)・比較演算子の追加
- 新しく「センシング」「演算」「変数」カテゴリを追加し、計5カテゴリ・16ブロックに拡充
- 生成コードは実際の `arduino-cli` でコンパイル成功を確認済み(実機書き込みは次回接続時に再確認予定)

## ✅ Phase 2 — 初回セットアップ／パッケージング強化（完了）

教員・生徒が `arduino-cli` の存在を意識しなくてよいようにした。

- [x] `arduino-cli` 本体(1.5.1)とSPRESENSEコア(3.4.7)のバージョン固定＋アプリ内からの自動インストール
  - 専用データディレクトリ(Electronの `userData`)に閉じ込め、既存のArduino IDE環境とは衝突しない
  - 起動時にバイナリ/コアの有無とバージョンを確認し、揃っていればネットワークに一切アクセスしない
    (教室でオフラインでも普段どおり起動できる)
  - 開発時は `SPRESENSE_BLOCKS_ARDUINO_CLI_PATH` 環境変数を設定すると自動セットアップを丸ごとスキップできる
- [x] 初回セットアップ中は専用の画面(SetupScreen)で進捗を表示。失敗時は再試行ボタンを表示
- [x] Windows USBドライバの案内リンク(ツールバーの「USBが認識されないときは」)
  - 本当の意味での「未インストール検出」は行っておらず、常時表示の案内リンクに留めている
    (Windows側の信頼できる検出手段が無いため。今後の改善余地)
- [x] `electron-builder` でのWindowsインストーラー作成・実機インストールでの動作確認済み
  - 実行時に必要なファイルはすべて Vite が単一ファイルにバンドルするため、
    `node_modules` を丸ごと同梱する必要がなく、`asarUnpack` は不要と判明
    (`@spresense-blocks/*` 等のワークスペース依存は package.json の `dependencies` ではなく
    `devDependencies` に置く必要がある。さもないと electron-builder が
    シンボリックリンクの解決に失敗してビルドが落ちる)
- [x] ダウンロード失敗時のリトライ・タイムアウト整備
  - arduino-cli本体のダウンロード: 60秒タイムアウト×3回リトライ
  - arduino-cliコマンド全般(コンパイル・コアインストール等): 5分でタイムアウトし、
    ハングしたまま固まらないようにした
  - 失敗時はプロキシ/ファイアウォールの可能性を案内するメッセージを表示

**実装時に分かったこと**: Electronの `app.getName()` は既定でnpmパッケージ名
(`@spresense-blocks/editor`、スコープ付き)をそのまま使うため、`userData` のパスが
`AppData/Roaming/@spresense-blocks/editor`(スラッシュ入りの分かりにくいパス)になり、
electron-builderのインストール先フォルダ名(`@spresense-blockseditor`)とも食い違って
デバッグ時に混乱を招いた。`app.setName("spresense-blocks")` を明示することで解決した。

## ⬜ Phase 3 — sensor-addon ＋ audio パック

- [ ] センサー拡張ボード(加速度・気圧など)の値取得ブロック
  - 正式なチップ型番・ライブラリ名の確認が必要
- [ ] 音声パック(SD再生・簡易録音)
  - `Audio.h` の初期化ボイラープレートをコード生成側に隠す
  - 「SDカード準備アシスタント」UI(デコーダファイル配置を自動化し、コンパイルは通るのに音が出ない問題を防ぐ)
- [ ] 各パックにゴールデンファイル方式のコード生成テストを追加
- [ ] CIで実際に `arduino-cli compile` を通すサンプルプロジェクトを追加

## ⬜ Phase 4 — MVP仕上げ

- [ ] 開発用の非表示コードビューを内部QAとして活用
- [ ] 全パックの `ja.json` 整備
- [ ] サンプル/チュートリアル作成
- [ ] 管理者権限なしの学校PCイメージでのパッケージング検証

## ⬜ Phase 5 — コード表示のユーザー向け解放 ＋ 拡張基盤整備

- [ ] 読み取り専用・シンタックスハイライト付きコードパネルを正式機能化
- [ ] `_template` パック(新規ブロックパックのひな形)＋ CONTRIBUTING手順書を整備
- [ ] カメラ・GNSS・LTE・BLE・マルチコア対応パックの追加(このロードマップの拡張)

---

参考: [docs/architecture.md](./architecture.md)(設計の勘所)、
[docs/adding-a-block-pack.md](./adding-a-block-pack.md)(新機能追加の手順)
