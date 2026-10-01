import * as Blockly from "blockly/core";
import { BlockCategoryColour } from "@spresense-blocks/block-shared";
import ja from "./locales/ja.json" with { type: "json" };

/** このパックが使う Blockly メッセージ(i18n文字列)を登録する。ブロック定義より先に呼ぶこと。 */
export function installMessages(): void {
  Object.assign(Blockly.Msg, ja);
}

/**
 * アプリに同梱されている音色(音源フォルダ名)。
 * `apps/editor/resources/instrument-sounds/<フォルダ名>/` に実体のWAVファイルがあり、
 * `apps/editor/src/main/sdcard.ts` の AVAILABLE_VOICES と一致させること。
 */
const VOICE_OPTIONS: Blockly.MenuOption[] = [
  ["%{BKY_SPRESENSE_INSTRUMENT_VOICE_PIANO}", "Piano"],
  ["%{BKY_SPRESENSE_INSTRUMENT_VOICE_SAX}", "Sax"],
];

/**
 * 鳴らせるノート番号(MIDIノート番号)。C3(48)〜B4(71)の2オクターブ分、
 * 全音音階(ダイアトニックスケール、シャープ抜き)のみをドロップダウンで選べるようにしている。
 * 同梱の音源WAV(packages/block-packs/instrument/tools/generate-sound-assets.py で生成)も
 * ちょうどこの14音分しか用意していないので、generators.ts の NOTE_TABLE と必ず一致させること。
 */
const NOTE_OPTIONS: Blockly.MenuOption[] = [
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_LOW_DO}", "48"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_LOW_RE}", "50"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_LOW_MI}", "52"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_LOW_FA}", "53"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_LOW_SO}", "55"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_LOW_LA}", "57"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_LOW_SHI}", "59"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_DO}", "60"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_RE}", "62"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_MI}", "64"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_FA}", "65"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_SO}", "67"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_LA}", "69"],
  ["%{BKY_SPRESENSE_INSTRUMENT_NOTE_SHI}", "71"],
];

/** instrument パック(ssprocLibを使った「ゆる楽器」)のブロック定義を Blockly に登録する。 */
export function installBlocks(): void {
  Blockly.defineBlocksWithJsonArray([
    {
      type: "spresense_instrument_setup",
      message0: "%{BKY_SPRESENSE_INSTRUMENT_SETUP}",
      args0: [{ type: "field_dropdown", name: "VOICE", options: VOICE_OPTIONS }],
      previousStatement: null,
      nextStatement: null,
      colour: BlockCategoryColour.SOUND,
      tooltip: "%{BKY_SPRESENSE_INSTRUMENT_SETUP_TOOLTIP}",
    },
    {
      // ボタンの状態そのものは扱わない(センシングカテゴリの「デジタルピンがONになっている」+
      // 「もし〜なら」と組み合わせて使ってもらう想定)。このブロックは「音を鳴らす」ことだけに専念する。
      // 高さ(音階)・長さ(ミリ秒)・大きさ(0〜100)の3つをこの1ブロックにまとめている。
      type: "spresense_instrument_play_note",
      message0: "%{BKY_SPRESENSE_INSTRUMENT_PLAY_NOTE}",
      args0: [
        { type: "field_dropdown", name: "NOTE", options: NOTE_OPTIONS },
        { type: "field_number", name: "DURATION_MS", value: 300, min: 0, precision: 1 },
        { type: "field_number", name: "VOLUME", value: 100, min: 0, max: 100, precision: 1 },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: BlockCategoryColour.SOUND,
      tooltip: "%{BKY_SPRESENSE_INSTRUMENT_PLAY_NOTE_TOOLTIP}",
    },
  ]);
}
