/**
 * ★新しいブロックパックを作るときのひな形です。★
 *
 * 使い方:
 * 1. `packages/block-packs/_template` ディレクトリを丸ごとコピーして、
 *    `packages/block-packs/<新しいパック名>` にリネームする。
 * 2. package.json の "name" を `@spresense-blocks/block-pack-<新しいパック名>` に変更する。
 * 3. このファイル・generators.ts・locales/ja.json・toolbox.json の中身を、
 *    実際に作りたいブロックに合わせて書き換える(ブロックtypeの接頭辞 `spresense_template_` も
 *    `spresense_<新しいパック名>_` のように変える)。
 * 4. 詳しい手順は [docs/adding-a-block-pack.md](../../../docs/adding-a-block-pack.md) を参照。
 *
 * このファイルでは、よくある2パターンのブロックを例として用意している:
 *   - `spresense_template_action`: ハードウェアに指示を出す「statement」ブロック(動作系)
 *   - `spresense_template_value`: ハードウェアから値を読み取る「value」ブロック(センシング系)
 */
import * as Blockly from "blockly/core";
import { pins } from "@spresense-blocks/board-spresense";
import { BlockCategoryColour } from "@spresense-blocks/block-shared";
import ja from "./locales/ja.json" with { type: "json" };

/** このパックが使う Blockly メッセージ(i18n文字列)を登録する。ブロック定義より先に呼ぶこと。 */
export function installMessages(): void {
  Object.assign(Blockly.Msg, ja);
}

// ピン番号など基板依存の値は、ハードコードせず @spresense-blocks/board-spresense の
// `pins` からドロップダウンの選択肢を組み立てる(ボードが変わってもここは直さなくて済む)。
const DIGITAL_PIN_OPTIONS: Blockly.MenuOption[] = pins.digitalPins.map((p) => [p.label, p.id]);

/** このパックのブロック定義を Blockly に登録する。 */
export function installBlocks(): void {
  Blockly.defineBlocksWithJsonArray([
    {
      // ブロックの種類を表す一意な文字列。必ず "spresense_" で始める。
      type: "spresense_template_action",
      // %1, %2 ... は args0 の配列と対応する(1始まり)。
      message0: "%{BKY_SPRESENSE_TEMPLATE_ACTION}",
      args0: [
        { type: "field_dropdown", name: "PIN", options: DIGITAL_PIN_OPTIONS },
        {
          type: "field_dropdown",
          name: "STATE",
          options: [
            ["ON", "HIGH"],
            ["OFF", "LOW"],
          ],
        },
      ],
      // statement(動作)ブロックは前後に他のブロックをつなげられるようにする。
      previousStatement: null,
      nextStatement: null,
      // 色は必ず BlockCategoryColour から選ぶ(新しい色を増やさない)。
      // 動作系なら ACTION、センシング系なら SENSING、のように既存の使い分けに合わせる。
      colour: BlockCategoryColour.ACTION,
      tooltip: "%{BKY_SPRESENSE_TEMPLATE_ACTION_TOOLTIP}",
    },
    {
      type: "spresense_template_value",
      message0: "%{BKY_SPRESENSE_TEMPLATE_VALUE}",
      args0: [{ type: "field_dropdown", name: "PIN", options: DIGITAL_PIN_OPTIONS }],
      // value(値を返す)ブロックは previousStatement/nextStatement の代わりに output を持つ。
      // "Number" か "Boolean" を型として指定しておくと、他のブロックの入力スロットと
      // つなげられる(core-ioの比較ブロック等が Number の入力を要求するのと同じ)。
      output: "Number",
      colour: BlockCategoryColour.SENSING,
      tooltip: "%{BKY_SPRESENSE_TEMPLATE_VALUE_TOOLTIP}",
    },
  ]);
}
