import * as Blockly from "blockly/core";
import { pins } from "@spresense-blocks/board-spresense";
import { BlockCategoryColour } from "@spresense-blocks/block-shared";
import ja from "./locales/ja.json" with { type: "json" };

/** このパックが使う Blockly メッセージ(i18n文字列)を登録する。ブロック定義より先に呼ぶこと。 */
export function installMessages(): void {
  Object.assign(Blockly.Msg, ja);
}

const LED_OPTIONS: Blockly.MenuOption[] = pins.onboardLeds.map((led) => [led.label, led.id]);
const DIGITAL_PIN_OPTIONS: Blockly.MenuOption[] = pins.digitalPins.map((p) => [p.label, p.id]);
const ANALOG_PIN_OPTIONS: Blockly.MenuOption[] = pins.analogPins.map((p) => [p.label, p.id]);

const COMPARE_OPTIONS: Blockly.MenuOption[] = [
  ["=", "EQ"],
  ["≠", "NEQ"],
  [">", "GT"],
  ["<", "LT"],
  ["≥", "GTE"],
  ["≤", "LTE"],
];

/** core-io パックのブロック定義を Blockly に登録する。 */
export function installBlocks(): void {
  Blockly.defineBlocksWithJsonArray([
    {
      type: "spresense_forever",
      message0: "%{BKY_SPRESENSE_COREIO_FOREVER}",
      args0: [{ type: "input_statement", name: "DO" }],
      // 中に他のブロックを入れる「制御構文」なので、同じ制御カテゴリの中でも
      // 濃いオレンジ(CONTROL_STRUCTURE)にして単純な制御ブロックと区別する。
      colour: BlockCategoryColour.CONTROL_STRUCTURE,
      // 前後の接続を持たない「開始ブロック」。vanilla Blockly には
      // Scratch-Blockly のような帽子型(hat)ブロックの組み込み機能がないため、
      // 見た目は通常の四角ブロックのまま、接続を持たせないことで
      // 「単独でしか置けない」という機能だけを再現する。
      tooltip: "%{BKY_SPRESENSE_COREIO_FOREVER_TOOLTIP}",
    },
    {
      type: "spresense_onboard_led_set",
      message0: "%{BKY_SPRESENSE_COREIO_LED_SET}",
      args0: [
        { type: "field_dropdown", name: "LED", options: LED_OPTIONS },
        {
          type: "field_dropdown",
          name: "STATE",
          options: [
            ["%{BKY_SPRESENSE_COREIO_ON}", "HIGH"],
            ["%{BKY_SPRESENSE_COREIO_OFF}", "LOW"],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: BlockCategoryColour.ACTION,
      tooltip: "%{BKY_SPRESENSE_COREIO_LED_SET_TOOLTIP}",
    },
    {
      type: "spresense_wait_ms",
      message0: "%{BKY_SPRESENSE_COREIO_WAIT_MS}",
      args0: [{ type: "field_number", name: "MS", value: 500, min: 0, precision: 1 }],
      previousStatement: null,
      nextStatement: null,
      colour: BlockCategoryColour.CONTROL,
      tooltip: "%{BKY_SPRESENSE_COREIO_WAIT_MS_TOOLTIP}",
    },
    {
      type: "spresense_digital_write",
      message0: "%{BKY_SPRESENSE_COREIO_DIGITAL_WRITE}",
      args0: [
        { type: "field_dropdown", name: "PIN", options: DIGITAL_PIN_OPTIONS },
        {
          type: "field_dropdown",
          name: "STATE",
          options: [
            ["%{BKY_SPRESENSE_COREIO_DIGITAL_HIGH}", "HIGH"],
            ["%{BKY_SPRESENSE_COREIO_DIGITAL_LOW}", "LOW"],
          ],
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: BlockCategoryColour.ACTION,
      tooltip: "%{BKY_SPRESENSE_COREIO_DIGITAL_WRITE_TOOLTIP}",
    },
    {
      type: "spresense_pwm_write",
      message0: "%{BKY_SPRESENSE_COREIO_PWM_WRITE}",
      args0: [
        { type: "field_dropdown", name: "PIN", options: DIGITAL_PIN_OPTIONS },
        { type: "input_value", name: "VALUE", check: "Number" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: BlockCategoryColour.ACTION,
      tooltip: "%{BKY_SPRESENSE_COREIO_PWM_WRITE_TOOLTIP}",
    },
    {
      type: "spresense_digital_read",
      message0: "%{BKY_SPRESENSE_COREIO_DIGITAL_READ}",
      args0: [{ type: "field_dropdown", name: "PIN", options: DIGITAL_PIN_OPTIONS }],
      output: "Boolean",
      colour: BlockCategoryColour.SENSING,
      tooltip: "%{BKY_SPRESENSE_COREIO_DIGITAL_READ_TOOLTIP}",
    },
    {
      type: "spresense_analog_read",
      message0: "%{BKY_SPRESENSE_COREIO_ANALOG_READ}",
      args0: [{ type: "field_dropdown", name: "PIN", options: ANALOG_PIN_OPTIONS }],
      output: "Number",
      colour: BlockCategoryColour.SENSING,
      tooltip: "%{BKY_SPRESENSE_COREIO_ANALOG_READ_TOOLTIP}",
    },
    {
      type: "spresense_repeat_times",
      message0: "%{BKY_SPRESENSE_COREIO_REPEAT_TIMES}",
      args0: [
        { type: "field_number", name: "TIMES", value: 10, min: 0, precision: 1 },
        { type: "input_statement", name: "DO" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: BlockCategoryColour.CONTROL_STRUCTURE,
      tooltip: "%{BKY_SPRESENSE_COREIO_REPEAT_TIMES_TOOLTIP}",
    },
    {
      type: "spresense_if",
      message0: "%{BKY_SPRESENSE_COREIO_IF}",
      args0: [
        { type: "input_value", name: "CONDITION", check: "Boolean" },
        { type: "input_statement", name: "DO" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: BlockCategoryColour.CONTROL_STRUCTURE,
      tooltip: "%{BKY_SPRESENSE_COREIO_IF_TOOLTIP}",
    },
    {
      type: "spresense_compare",
      message0: "%{BKY_SPRESENSE_COREIO_COMPARE}",
      args0: [
        { type: "input_value", name: "A", check: "Number" },
        { type: "field_dropdown", name: "OP", options: COMPARE_OPTIONS },
        { type: "input_value", name: "B", check: "Number" },
      ],
      inputsInline: true,
      output: "Boolean",
      colour: BlockCategoryColour.OPERATOR,
      tooltip: "%{BKY_SPRESENSE_COREIO_COMPARE_TOOLTIP}",
    },
    {
      type: "spresense_number",
      message0: "%1",
      args0: [{ type: "field_number", name: "NUM", value: 0 }],
      output: "Number",
      colour: BlockCategoryColour.OPERATOR,
      tooltip: "%{BKY_SPRESENSE_COREIO_NUMBER_TOOLTIP}",
    },
    {
      type: "spresense_variable_set",
      message0: "%{BKY_SPRESENSE_COREIO_VARIABLE_SET}",
      args0: [
        { type: "field_input", name: "NAME", text: "へんすう" },
        { type: "input_value", name: "VALUE", check: "Number" },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: BlockCategoryColour.VARIABLE,
      tooltip: "%{BKY_SPRESENSE_COREIO_VARIABLE_SET_TOOLTIP}",
    },
    {
      type: "spresense_variable_get",
      message0: "%{BKY_SPRESENSE_COREIO_VARIABLE_GET}",
      args0: [{ type: "field_input", name: "NAME", text: "へんすう" }],
      output: "Number",
      colour: BlockCategoryColour.VARIABLE,
      tooltip: "%{BKY_SPRESENSE_COREIO_VARIABLE_GET_TOOLTIP}",
    },
  ]);
}
