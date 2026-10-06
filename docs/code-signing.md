# コード署名(SignPath Foundation)の設定手順

Windows インストーラーに、[SignPath Foundation](https://signpath.org/) の無料コード署名を付けるための手順です。
リリース用のワークフロー(`.github/workflows/release.yml`)は、この手順の設定が済んでいれば
インストーラーに署名してから公開し、設定が無い間はこれまでどおり署名せずに公開します。
そのため、申請の審査中もリリースは止まりません。

> **注意**: SignPath Foundation の申請条件や画面の項目名は変わることがあります。
> この手順は 2026年10月時点の情報をもとにしています。申請の前に、必ず
> [signpath.org](https://signpath.org/) の最新の条件(Terms)を確認してください。

## 1. SignPath Foundation に申請する

[signpath.org/apply.html](https://signpath.org/apply.html) から申請します。主な条件は次のとおりです。

- OSI が承認したオープンソースライセンスであること(このプロジェクトは MIT ライセンス)
- 活発に保守されていて、すでにリリースがあること(v1.0.0〜v1.2.0 を公開済み)
- 非公開の独自部品を含まないこと
- 署名するファイルは、GitHub がホストする実行環境で、リポジトリのソースから自動でビルドされたものであること
  (`release.yml` は `windows-latest` で、タグ/master のソースからビルドしている)
- プロジェクトのページに「コード署名ポリシー」を載せること
  (README の「[コード署名ポリシー](../README.md#コード署名ポリシー)」に記載済み。審査で求められた内容があれば追記する)

審査が通ると、SignPath.io のアカウント(組織)とプロジェクトが用意されます。

## 2. SignPath 側の設定

SignPath の画面で、次を確認・設定します。

1. **GitHub 連携(Trusted Build System)**: プロジェクトに GitHub.com のビルドシステムがつながっていること
2. **Artifact Configuration(署名する対象)**: [`.signpath/artifact-configuration.xml`](../.signpath/artifact-configuration.xml) の内容を使う
   (インストーラーの `.exe` 1つに Authenticode 署名を付ける設定)
3. **Signing Policy(署名ポリシー)**: リリース用のポリシー(例: `release-signing`)。手動承認が必要な設定になっている
4. **API トークン**: 署名リクエストを送るための CI 用ユーザーを作り、その API トークンを発行する
   (このユーザーに、上の署名ポリシーで「submitter(送信者)」の権限を付ける)

## 3. GitHub 側の設定

リポジトリの **Settings → Secrets and variables → Actions** で、次を登録します。

| 種類 | 名前 | 値 |
|---|---|---|
| Secret | `SIGNPATH_API_TOKEN` | 手順2-4で発行した API トークン |
| Variable | `SIGNPATH_ORGANIZATION_ID` | SignPath の組織ID(画面の URL や組織の設定にある、英数字とハイフンのID) |
| Variable | `SIGNPATH_PROJECT_SLUG` | SignPath のプロジェクトの slug(短い識別名) |
| Variable | `SIGNPATH_SIGNING_POLICY_SLUG` | 署名ポリシーの slug(例: `release-signing`) |
| Variable | `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` | (任意)Artifact Configuration の slug。省略するとプロジェクトの既定の設定を使う |

`SIGNPATH_API_TOKEN` が登録されると、次回のリリースから自動で署名されます。

## 4. リリースのときの流れ

1. これまでどおり、バージョンを上げてリリースノートを書き、`master` に反映して「Release」ワークフローを実行する
2. ワークフローがインストーラーをビルドし、SignPath に署名リクエストを送る
3. **SignPath の画面(またはメール通知)で、署名リクエストを承認する**
   - ワークフローは承認を最大4時間待ちます。4時間を過ぎるとワークフローは失敗するので、承認してからワークフローを再実行してください
4. 署名済みのインストーラーが返ってくると、Windows の仕組みで署名が有効かを確かめてから、GitHub Releases に公開します

## 署名されているかの確かめ方

ダウンロードしたインストーラーを右クリック →「プロパティ」→「デジタル署名」タブで、署名者が
「SignPath Foundation」になっていれば署名されています。

## 知っておきたいこと

- **署名しても、Windows の SmartScreen の警告がすぐに消えるとは限りません。** SmartScreen はダウンロード実績
  (評判)が貯まるまで警告を出すことがあります。署名すると、発行元が「不明な発行元」ではなく
  「SignPath Foundation」と表示され、評判も署名者に積み上がっていきます。
- 署名者の名前は「SignPath Foundation」になります(開発者個人や大学の名前ではありません)。
- 署名しているのは、ダウンロードされるインストーラー(`Spresense Blocks Setup <バージョン>.exe`)です。
