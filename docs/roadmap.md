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
