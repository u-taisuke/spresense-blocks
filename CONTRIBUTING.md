# CONTRIBUTING

Spresense Blocksの開発に参加する方向けのガイドです。

## まず読むもの

- [docs/architecture.md](docs/architecture.md): 設計の全体像となぜそうなっているか
- [docs/adding-a-block-pack.md](docs/adding-a-block-pack.md): 新しいブロックパックを追加する手順
- [docs/roadmap.md](docs/roadmap.md): 現在地と今後の計画

## 開発環境のセットアップ

[README.md](README.md)の「開発者向けセットアップ」を参照してください。

```bash
npm install
npm run dev
```

## 新しいブロックパック(ハードウェア機能)を追加する

このプロジェクトは「機能ごとにブロックパックを追加するだけで拡張できる」ことを
最重要の設計目標にしています。カメラ・GNSS・LTE・BLE・マルチコア対応などを
追加したい場合は、次の手順で進めてください。

1. [packages/block-packs/\_template](packages/block-packs/_template) をコピーして
   新しいパックのひな形にする(`_template/README.md` に手順あり)。
2. [docs/adding-a-block-pack.md](docs/adding-a-block-pack.md) に沿って、
   ブロック定義・コード生成・テストを書く。
3. 新しいArduinoライブラリが必要な場合は、必ず実際のライブラリのヘッダー/ソースを確認してから
   (推測で実装しない)、`packages/board-spresense` にコミット固定(git-url)または
   Library Manager名で登録する。
4. 可能であれば実機、少なくとも `arduino-cli compile` で実際にコンパイルが通ることを
   確認してから統合する。`apps/editor/test/generate-ci-samples.test.ts` にサンプルを
   1つ追加しておくと、以後のCIで継続的に検証される。

### arduino-cliを使った調査をするときの注意

ライブラリの挙動を調べるために `arduino-cli lib install` 等を試す場合、
**開発者の既存Arduino環境(デフォルトの `arduino-cli` config)を汚さないこと。**
必ず `--config-file` で専用の一時ディレクトリを指定すること。
(過去に一度、これを怠って開発者の実環境にライブラリを誤インストールしてしまった事故があります。)

```bash
mkdir -p /tmp/arduino-cli-research
cat > /tmp/arduino-cli-research/config.yaml <<'EOF'
directories:
  data: /tmp/arduino-cli-research/data
  user: /tmp/arduino-cli-research/user
EOF
arduino-cli --config-file /tmp/arduino-cli-research/config.yaml lib search <ライブラリ名>
```

## テスト・型チェック

コミット前に必ず実行してください。

```bash
npm test
npm run typecheck
```

新しいブロックパックには、`packages/block-packs/core-io/test/generators.test.ts` を参考に
「このブロック構成なら、このC++コードが出る」ことを検証するゴールデンファイル方式のテストを
追加してください。

## UIを目で確認する

ツールバーのボタンやダイアログなど、新しいUI要素を追加した場合は
[.claude/skills/run-desktop/](.claude/skills/run-desktop/) のPlaywrightドライバーで
実際にアプリを起動して確認してください(Blockly本体のツールボックス操作は合成イベントでは
不安定なため、ボタン・モーダル・フォーム等のトップレベルUIの確認に使うことを推奨します)。

## コミットメッセージ

Conventional Commits等の厳密な規約は定めていませんが、「何を」ではなく「なぜ」を
意識した日本語の説明的なメッセージを書いてください(過去のコミットログを参考にしてください)。

## プルリクエスト

- 1つの変更は、関連するコード・テスト・ドキュメント(roadmap.md等)の更新をまとめて1つのPRにしてください。
- 実機検証ができない変更(開発者が対象ハードウェアを持っていない等)は、
  その旨を正直にPRの説明に書いてください。「コンパイルは通るが実機未確認」は
  このプロジェクトでは許容されていますが、黙っておくのではなく明記することが重要です。
