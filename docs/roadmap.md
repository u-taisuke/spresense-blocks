# 開発ロードマップ

現在地と、今後のフェーズの計画です。進捗に応じてこのファイルを更新していきます。

**Phase 0〜5(MVP)が完了しました(2026-10-01)。** 基本I/O・拡張センサー・「ゆる楽器」・
初回セットアップ自動化・無管理者権限インストール・サンプル/チュートリアル・開発基盤整備まで
一通り揃っています。この先(カメラ・GNSS・LTE・BLE・マルチコア対応)は、必要になった時点で
`_template` パックと [CONTRIBUTING.md](../CONTRIBUTING.md) を使って追加していく方針です。

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

**不具合修正(2026-10-01)**: SPRESENSEを挿したままアプリを起動すると、最初の「コンパイル & 書き込み」が
再現性高く失敗する不具合があった。原因は `ArduinoCliClient` の排他制御で、実行中のコマンドがあると
新しいコマンドを即座に `ArduinoCliBusyError` で失敗させていたため、バックグラウンドのポート自動検出
ポーリング(2秒おき)とユーザーの最初のビルドがたまたま重なると失敗していた(起動直後はポートが
すぐ見つかって自動選択されるため、ユーザーがすぐビルドを押すとポーリングと重なりやすかった)。
「busyなら即座に失敗」ではなく「busyなら前のコマンドの完了を待ってから実行する」キュー方式に変更して解消した
(`packages/arduino-cli-bridge/src/ArduinoCliClient.ts`)。

**実装時に分かったこと**: Electronの `app.getName()` は既定でnpmパッケージ名
(`@spresense-blocks/editor`、スコープ付き)をそのまま使うため、`userData` のパスが
`AppData/Roaming/@spresense-blocks/editor`(スラッシュ入りの分かりにくいパス)になり、
electron-builderのインストール先フォルダ名(`@spresense-blockseditor`)とも食い違って
デバッグ時に混乱を招いた。`app.setName("spresense-blocks")` を明示することで解決した。

## ✅ Phase 3 — sensor-addon ＋ audio パック（完了）

- [x] センサー拡張ボード(SSCI-052580、BMP280/BMI160搭載、2026年時点で販売終了)の値取得ブロック
  - 加速度(X/Y/Z、G単位)・気圧(hPa)・温度(℃)の3ブロック、カテゴリ色はセンシングと同じ水色
  - BMP280は正式なAdafruitライブラリ(Library Manager経由で自動インストール)
  - BMI160はLibrary Managerに無いため、GitHub(hanyazou/BMI160-Arduino)からコミット固定で自動取得
    (`library.enable_unsafe_install` を専用configでのみ有効化)
  - ブロックパックが追加のarduino-cliライブラリを宣言できる仕組み(`LibraryDependency`)を新設し、
    初回セットアップ時に自動インストールされるようにした
  - **アーキテクチャ上の重要な修正**: 各ブロックパックが個別に `Blockly.Generator` を作っていたのを、
    アプリ全体で1つの共有インスタンスに各パックが `registerGenerators()` で登録する方式に変更。
    複数パックのブロックを同じワークスペースで混在させるために必須の修正だった
    (`apps/editor/src/renderer/src/codegen.ts` が合成を担当)
  - 実機相当の自動セットアップ環境で、加速度・気圧・温度ブロックを含む統合スケッチの
    コンパイル成功を確認済み(2026-09-29)。**実機(実際のセンサー値)での動作確認はまだ未実施**
    (開発者がまだセンサー拡張ボードを入手していないため)
- [x] 「ゆる楽器」パック(Sony公式 ssprocLib = Sound Signal Processing Library for Spresenseを使用)
  - リポジトリ: https://github.com/SonySemiconductorSolutions/ssih-music。Arduino Library Managerには
    未登録のため、他のライブラリと同様GitHubからコミット固定(タグv1.3.0)で自動取得する
  - `examples/ButtonDrum` の構成(ボタン入力→SDSinkでWAV再生)を参考にブロック化。
    「ゆる楽器を鳴らす(音色: ピアノ/サックス)」(SDSinkの初期化・毎ループの`update()`を隠す)、
    「"〜"の音を、長さ〜ミリ秒、大きさ〜で鳴らす」(単音、高さ・長さ・大きさを1ブロックにまとめた)、
    「"〜"と"〜"の和音を、長さ〜ミリ秒、大きさ〜で鳴らす」(2音までの和音、同じく3パラメータ入り)の3ブロック。
    和音ブロックは単音ブロックと同じ「鳴らす処理」を共有(`generators.ts`の`buildPlayCode`)しており、
    2音とも今鳴っていないときだけまとめて鳴らし始める
  - **設計変更(2026-10-01、2回)**: 当初はボタン検知も1つのブロックに含めていたが、ピンの状態を見る
    機能はcore-ioの「デジタルピンがONになっている」+「もし〜なら」で既にできるため、
    「ゆる楽器」パックは音を鳴らすことだけに専念する設計に変更した。「音を鳴らす」ブロックは
    呼ばれるたびに「今鳴っていなければ鳴らす」引き金として働き、設定した長さが経過すると
    (ブロックが再度呼ばれなくても)`spresense_instrument_setup`が毎ループ行う経過時間チェックで
    自動的に音を止める。長さは当初「音の長さを設定する」という別ブロックで共有設定にしていたが、
    「高さ・長さ・大きさをセットにしたブロックにしてほしい」という要望を受けて1ブロックにまとめ直した。
    「大きさ」はssprocLib(SDSink)がノートごとの音量制御を持たない(MIDIのvelocityは「0なら音を止める」
    判定にしか使われない)ため、`setParam(Filter::PARAMID_OUTPUT_LEVEL, ...)`という
    SDSinkインスタンス全体にかかる共通の音量つまみとして実装している(同時に鳴っている他の音にも
    影響する。ブロックのtooltipで明記)。詳しくは
    `packages/block-packs/instrument/src/generators.ts` のコメントを参照
  - ssprocLibのexample自体が使っている`Button`ヘルパークラス(チャタリング防止)は、SketchBuilderの
    出力順(クラス定義が常にグローバル変数より後に出る)と相性が悪いため採用していない
    (詳しくは [adding-a-block-pack.md](./adding-a-block-pack.md) を参照)
  - 実機相当の自動セットアップ環境で、ssprocLib自体のコンパイル成功を確認済み(2026-09-29)
- [x] 音源アセット(ピアノ・サックス、各2オクターブ)の同梱と「SDカード準備アシスタント」
  - 録音済み素材はライセンスが不明瞭になりがちなため使わず、
    `packages/block-packs/instrument/tools/generate-sound-assets.py` で倍音合成した
    オリジナルのWAV(48kHz/16bit/2ch。ssprocLibのPcmRendererが要求する形式に厳密に合わせている)を
    生成し、`apps/editor/resources/instrument-sounds/{Piano,Sax}/` にコミット済み
  - SPRESENSE本体はUSB接続時にSDカードをドライブとして公開しない(書き込み用シリアルポートとしてしか
    見えない)ため、「コンパイル&書き込み」と同じ流れでは音源を配置できない。そこでユーザーが
    microSDカードを取り外してPC本体・USBカードリーダーに挿す運用を前提にした別画面
    (ツールバーの「SDカードに音源をコピー」→`apps/editor/src/renderer/src/SdCardPanel.tsx`)を用意し、
    PowerShell経由でリムーバブルドライブを検出して(`apps/editor/src/main/sdcard.ts`)、
    選んだ音色フォルダをそのままコピーする
  - electron-builderの`extraResources`でパッケージ後も`resources/instrument-sounds/`が
    同梱されるようにした(`apps/editor/electron-builder.yml`)
  - 実機相当の自動セットアップ環境で、Piano/Sax両方の音源テーブルを含む統合スケッチの
    コンパイル成功を確認済み(2026-09-29)。**実機(実際のSDカード+スピーカーでの音出し)での
    動作確認はまだ未実施**(生成した音がssprocLib上で実際にどう聞こえるかは、実機で確認するまで未検証)
  - **未着手**: 実機(実際のSDカード+スピーカー)での音出し確認
- [x] 各パックにゴールデンファイル方式のコード生成テストを追加(全パック完了)
- [x] CIで実際に `arduino-cli compile` を通すサンプルプロジェクトを追加
  - `.github/workflows/ci.yml`: push/PR時に (1) typecheck・単体テスト、(2) 実際の
    `arduino-cli compile` でのサンプルプロジェクトのコンパイル確認、の2ジョブを実行
  - サンプルは手書きではなく、アプリ本体と同じ `codegen.ts`(全パック共有の
    `Blockly.Generator` を合成する場所)経由で生成する
    (`apps/editor/test/generate-ci-samples.test.ts` → `npm run generate:ci-samples`)。
    「ユニットテストは通るが、実アプリの合成経路では壊れている」種類の回帰を検知できる
  - ライブラリのインストール先(Library Manager名 or git-url)は `packages/board-spresense` の
    `allBlockPackLibraries` を単一の情報源にし、CI(`scripts/ci-install-arduino-deps.mjs`)と
    アプリ本体の自動セットアップ(`apps/editor/src/main/setup.ts`)の両方がそこを参照する設計にした
    (新しいブロックパックのライブラリを追加するとき、更新箇所が1箇所で済む)
- [x] SDカード機能のUI動作確認: Playwrightの `_electron` でElectronアプリを実際に起動・操作して
  検証するしくみを整備した(`.claude/skills/run-desktop/`)。手動のdynamic-importハックでは
  この環境で `app.whenReady()` が極端に遅延する問題があったが、`_electron.launch()` を使うことで
  解消し、実際にボタンクリック→モーダル表示→チェックボックス(ピアノ/サックス)の状態→
  ドライブ検出結果までエンドツーエンドで確認できた

## ✅ Phase 4 — MVP仕上げ（完了）

- [x] 開発用の非表示コードビューを内部QAとして活用
  - `Ctrl+Shift+C` でブロック編集画面の右側に生成C++コードのパネルが出る(もう一度押すと消える)。
    ツールバーにボタンは置かず、ショートカットキーのみ(生徒向けの正式機能ではないため)。
  - Playwrightの`_electron`で実際にトグルを確認済み(`.claude/skills/run-desktop/`)。
    ユーザー向けの正式公開はPhase 5(読み取り専用・シンタックスハイライト付き)で行う
- [x] 全パックの `ja.json` 整備
  - 全ブロックパック(core-io・sensor-addon・instrument)について、`blocks.ts` が参照する
    `%{BKY_...}` キーと `locales/ja.json` の定義キーを突き合わせ、過不足が無いことを確認済み
    (参照されているのに未定義のキー、定義されているのに未参照のキーのどちらも無し)
- [x] サンプル/チュートリアル作成
  - [docs/tutorial.md](./tutorial.md): 画面の見かた、Lチカを1から組み立てる手順、
    サンプルの使い方、「ゆる楽器」サンプルを鳴らすための手順、困ったときの参照先をまとめた
  - `samples/` フォルダに4つの`.sprsb`サンプルを追加(Lチカ、明るさでLED調光、
    ゆる楽器のボタンドラム、傾きセンサーでLED)。すべて実際にアプリの読込→コード生成→
    `arduino-cli compile` まで通ることを確認済み(2026-10-01)
- [x] SPRESENSEとして認識されていないポートへ書き込む前に確認する(2026-10-04)
  - 選んだポートが `arduino-cli board list` でSPRESENSEと判定されない(別の機器、または抜かれた後のポート)とき、
    「SPRESENSEが見つかりません」の確認画面を出し、「書き込む」を押したときだけ書き込む。ポートが1つも無いときは従来どおり書き込まない
  - 確認画面はアプリのデザインに合わせた部品(`ConfirmDialog.tsx`)にし、未保存の変更を捨てる前の確認もこれに統一した
    (最初は「やめる」にフォーカスを置き、Enterキーで誤って実行しないようにしている)
- [x] アプリからチュートリアルとサンプルを開けるようにした(2026-10-04)
  - ツールバーに「サンプル・使い方」ボタンを追加。サンプルの一覧(種類での絞り込み・必要な機材つき)と、
    チュートリアルへの入口を表示する(`LearnPanel.tsx`)
  - チュートリアル(docs/tutorial.md)をアプリ内で目次つきで表示する(`TutorialView.tsx`、Markdownの変換は marked)。
    本文中のサンプルへのリンクを押すと、そのサンプルを開く
  - Electron既定の英語メニューを日本語のメニューバーに置き換え(`src/main/menu.ts`)。
    「サンプル」メニューから各サンプルを、「ヘルプ」→「チュートリアル」(F1)からチュートリアルを開ける
  - サンプルの一覧は `samples/samples.json` にまとめ、`samples-manifest.test.ts` で .sprsb ファイル・
    チュートリアルのリンクとの過不足を検査する
  - 配布版には electron-builder の `extraResources` で `resources/content/` に同梱する
    (Linux版のパッケージを作り、パッケージ版から読み込めることを確認済み)
  - サンプルを開いた後の保存は、同梱ファイルを上書きしないよう必ず保存先を選ばせる。
    保存していない変更があるときは、別のプログラムを開く前に確認する
- [x] ゆる楽器のメロディでビビり音が出る問題を修正(2026-10-04)
  - 症状: 「音を鳴らす」と「待つ」を交互に並べたメロディで、音がほとんど鳴らずビビり音が出る
  - 原因1(主因): 「待つ」が `delay()` だったため、待っている間 `SDSink::update()` が呼ばれず、
    SDカードから音のデータが読み足されなかった(1回の読み足しは約50ミリ秒分)
  - 原因2: ssprocLib v1.3.0 の `PcmRenderer::render()` は、データが足りないチャンネルの
    未初期化メモリを音として混ぜてしまう(ビビり音の直接の原因)。上流の「Fix noise bug.」
    (5fcf93f, 2024-07)で修正済みのため、固定コミットをこれに更新した
  - 原因3: 時間切れの音を止める処理が `loop()` の先頭にしか無く、「繰り返す」の中では止まらずに
    同時発音数(4音)を使い切っていた
  - 対策: `SketchBuilder` に「待つ間も続ける処理」(`addBackgroundTask`)を追加。ゆる楽器の
    `update()` と音を止める処理をここに登録し、「待つ」ブロックはその処理を動かしながら待つ
    `spresenseWait()` を使うようにした(ゆる楽器を使わないプログラムは従来どおり `delay()`)。
    どの「待つ」より先に登録されるかは走査が終わるまでわからないため、コード生成は2回走査する
  - 生成コードに関数の前方宣言を出力するようにした(Arduinoのctagsによる自動補完に頼らない)
  - アプリのセットアップは、gitUrlで入れるライブラリのインストール時のURLを `library-pins.json` に記録し、
    固定コミットが変わったら入れ直すようにした(ssprocLibはバージョン表記が1.3.0のまま変わらないため)
  - サンプル10(ゆる楽器_メロディ)を追加
  - 全サンプルのコンパイルは確認済み。実機での音の確認はまだ
- [x] UIの刷新と表記の見直し(2026-10-04)
  - 明るい配色・アイコン付きのツールバーに刷新(ファイル操作 / ポート選択・書き込み / 補助機能でグループ分け)。
    横幅が狭い画面(1280px以下)では補助ボタンをアイコンのみにする
  - 右側を「メッセージ」「C++コード」のタブにまとめ、書き込みの状態(待機・書き込み中・完了・エラー)を
    色付きの帯で表示。ポート未選択時の `window.alert` も帯での表示に置き換えた
  - ポート選択に接続状態の印(緑: SPRESENSEを認識、黄: 不明なポート、灰: 未選択)を追加
  - ブロックの描画を Blockly の `zelos` レンダラー(Scratch 3.0に近い形)に変更し、作業エリア等の配色をテーマで統一。
    `zelos` はドロップダウンの▼を `data:` URIの画像で描くため、CSPに `img-src 'self' data:` を追加
  - フォントは教育向けUDフォント「BIZ UDPゴシック」(Windows 10以降に標準搭載)を優先
  - 小学校中学年〜中高生を想定し、表記を Scratch 3.0日本語版の「漢字」モードに合わせて見直し
    (例: 「回くり返す」→「回繰り返す」、「ひくい ド」→「低い ド」、「さがす」→「探す」)。
    サンプルのファイル名・変数名も合わせて変更
- [x] サンプル/チュートリアルの拡充
  - `samples/` に5つ追加(05 くり返しでLEDぴかぴか、06 ボタンでLED、07 温度でLED、
    08 ゆる楽器の和音ボタン、09 ゆる楽器のかたむき楽器)。計9サンプルになった
  - チュートリアルに「次のステップ」章(くり返し・変数と条件分岐・センサー・和音)と
    「やってみよう」を追加
  - `apps/editor/test/generate-ci-samples.test.ts` が `samples/*.sprsb` を全件読み込み、
    コード生成までを検証し、CIの `arduino-cli compile` 対象(`ci-samples/sample-<番号>/`)にも加わる
    (ここまでローカルで確認済み。実機での動作・`arduino-cli compile` はCIおよび実機での確認待ち)
  - チュートリアルのボタン配線を訂正: 生成コードは `pinMode(INPUT)` + `HIGH` 判定のため、
    「ピンとGNDの間にボタン」では押しても反応しない。電源側にボタン、GND側にプルダウン抵抗をつなぐ説明に修正
- [x] 管理者権限なしの学校PCイメージでのパッケージング検証
  - `apps/editor/electron-builder.yml` のnsis設定に `perMachine: false` を明示し、
    UAC昇格を要求しない(`asInvoker`)インストーラーになるようにした
  - 実際にインストーラーをビルドし、(1) 生成された`.exe`の埋め込みマニフェストが
    `asInvoker`であること(`requireAdministrator`/`highestAvailable`が含まれないこと)、
    (2) サイレントインストール(`/S`)が管理者権限昇格プロンプト無しで完了し、
    任意のユーザー書き込み可能なディレクトリにインストールされること、
    (3) `extraResources`で設定した音源WAVファイルが正しい場所
    (`resources/resources/instrument-sounds/`)に展開されること、
    (4) インストールしたアプリが実際に起動できること、をすべて確認済み(2026-10-01)
  - **未検証**: 実際の「学校のPCイメージ」(ドメイン参加・グループポリシー適用済みの環境)
    での動作確認。今回検証できたのは「インストーラーが管理者権限を要求しない設定になっており、
    実際に無昇格でインストール・起動まで動く」ところまでで、学校独自のセキュリティソフトや
    グループポリシーによる制限(実行ファイルのホワイトリスト等)までは検証できていない

## ✅ Phase 5 — コード表示のユーザー向け解放 ＋ 拡張基盤整備（完了）

- [x] 読み取り専用・シンタックスハイライト付きコードパネルを正式機能化
  - ツールバーに「コードを見る」ボタンを追加(Phase 4で追加した `Ctrl+Shift+C` の
    非表示パネルを正式機能に昇格)。`highlight.js`(オフライン同梱、CDN不使用)で
    C++のシンタックスハイライトを表示する読み取り専用パネル
    (`apps/editor/src/renderer/src/CodeView.tsx`)
  - Playwrightの`_electron`でボタンクリック→ハイライト付きコード表示まで確認済み
- [x] `_template` パック(新規ブロックパックのひな形)＋ CONTRIBUTING手順書を整備
  - [packages/block-packs/\_template](../packages/block-packs/_template): statement
    ブロック・valueブロックそれぞれ1個ずつの最小例を、コピーしてすぐ使えるように
    コメント付きで用意した。npm workspaceの一員としてtypecheck・テスト対象にもなっている
    (テンプレート自体が壊れていないことをCIが保証する)
  - [CONTRIBUTING.md](../CONTRIBUTING.md): 新規ブロックパックの追加手順、arduino-cliを
    使った調査時の環境隔離ルール、テスト・UI確認の進め方をまとめた
- [ ] カメラ・GNSS・LTE・BLE・マルチコア対応パックの追加(MVPの範囲外、今後の拡張候補)
  - いったんMVP(Phase 0〜5)はここで区切ることをユーザーと確認済み(2026-10-01)。
    各機能ごとに個別の調査(正確なライブラリ名・API)と対象ハードウェアの入手が必要なため、
    着手するときに改めて決める。`_template` パックと `CONTRIBUTING.md` は
    この拡張のための土台として整備済み

---

参考: [docs/architecture.md](./architecture.md)(設計の勘所)、
[docs/adding-a-block-pack.md](./adding-a-block-pack.md)(新機能追加の手順)
