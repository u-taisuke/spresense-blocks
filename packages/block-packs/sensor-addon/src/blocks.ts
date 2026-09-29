import * as Blockly from "blockly/core";
import { BlockCategoryColour } from "@spresense-blocks/block-shared";
import ja from "./locales/ja.json" with { type: "json" };

/** このパックが使う Blockly メッセージ(i18n文字列)を登録する。ブロック定義より先に呼ぶこと。 */
export function installMessages(): void {
  Object.assign(Blockly.Msg, ja);
}

const ACCEL_AXIS_OPTIONS: Blockly.MenuOption[] = [
  ["X", "0"],
  ["Y", "1"],
  ["Z", "2"],
];

/** sensor-addon パック(SPRESENSE用センサー拡張ボード)のブロック定義を Blockly に登録する。 */
export function installBlocks(): void {
  Blockly.defineBlocksWithJsonArray([
    {
      type: "spresense_sensor_accel",
      message0: "%{BKY_SPRESENSE_SENSORADDON_ACCEL}",
      args0: [{ type: "field_dropdown", name: "AXIS", options: ACCEL_AXIS_OPTIONS }],
      output: "Number",
      colour: BlockCategoryColour.SENSING,
      tooltip: "%{BKY_SPRESENSE_SENSORADDON_ACCEL_TOOLTIP}",
    },
    {
      type: "spresense_sensor_pressure",
      message0: "%{BKY_SPRESENSE_SENSORADDON_PRESSURE}",
      args0: [],
      output: "Number",
      colour: BlockCategoryColour.SENSING,
      tooltip: "%{BKY_SPRESENSE_SENSORADDON_PRESSURE_TOOLTIP}",
    },
    {
      type: "spresense_sensor_temperature",
      message0: "%{BKY_SPRESENSE_SENSORADDON_TEMPERATURE}",
      args0: [],
      output: "Number",
      colour: BlockCategoryColour.SENSING,
      tooltip: "%{BKY_SPRESENSE_SENSORADDON_TEMPERATURE_TOOLTIP}",
    },
  ]);
}
