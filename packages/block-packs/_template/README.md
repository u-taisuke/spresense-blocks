# ブロックパックのひな形(_template)

新しいブロックパック(カメラ・GNSS・LTE・BLE・マルチコア対応など)を追加するときの出発点です。

## 使い方

1. このディレクトリ(`packages/block-packs/_template`)を丸ごとコピーし、
   `packages/block-packs/<新しいパック名>` にリネームする。
2. `package.json` の `"name"` を `@spresense-blocks/block-pack-<新しいパック名>` に変更する。
3. `src/blocks.ts` / `src/generators.ts` / `src/locales/ja.json` / `toolbox.json` の中身を、
   実際に作りたいブロックに書き換える(ブロックtypeの接頭辞 `spresense_template_` も
   `spresense_<新しいパック名>_` に変える)。
4. 完成したら `apps/editor` 側(`BlocklyWorkspace.tsx` と `codegen.ts`)に登録する。

詳しい手順・設計上の注意点は [docs/adding-a-block-pack.md](../../../docs/adding-a-block-pack.md) と
[CONTRIBUTING.md](../../../CONTRIBUTING.md) を参照してください。

このパック自体は(他のパックと違って)`apps/editor` には登録されていません。
動作確認のため npm workspace の一員としてビルド・テスト・型チェックの対象にはなっています
(`npm test` / `npm run typecheck` で一緒に実行されます)。
