import * as Blockly from "blockly/core";
import { SketchBuilder } from "@spresense-blocks/codegen-core";

/**
 * ssprocLib の SDSink 音源テーブルに使う、ノート番号→ファイル名接尾辞の対応表。
 * C3(48)〜B4(71)の2オクターブ、全音音階(シャープ抜き)の14音のみ。
 * `packages/block-packs/instrument/tools/generate-sound-assets.py` が生成する
 * WAVファイル名、および blocks.ts の NOTE_OPTIONS と必ず一致させること。
 */
const NOTE_TABLE: Record<number, string> = {
  48: "48_C3",
  50: "50_D3",
  52: "52_E3",
  53: "53_F3",
  55: "55_G3",
  57: "57_A3",
  59: "59_B3",
  60: "60_C4",
  62: "62_D4",
  64: "64_E4",
  65: "65_F4",
  67: "67_G4",
  69: "69_A4",
  71: "71_B4",
};

/**
 * instrument パック(Sony公式 ssprocLib を使った「ゆる楽器」)のブロック用コード生成関数を、
 * 渡された Blockly.Generator に登録する。
 *
 * `generator` はアプリ全体で1つだけ作られる共有インスタンスを想定している
 * (core-io など他のブロックパックのブロックと同じワークスペースに混在するため)。
 * このパックはここで自分の `forBlock` を登録するだけで、
 * `Blockly.Generator` 自体の生成や `scrub_` の設定は呼び出し側(アプリ)の責任にする。
 *
 * ssprocLib の example(ButtonDrum.ino)にある Button クラス(ボタンのチャタリング防止)は
 * ライブラリ本体ではなく example 側の自作ヘルパーなので、そのまま移植すると
 * 「グローバル変数の初期化でクラスを使うが、クラス定義は SketchBuilder の最後尾(functions)に
 * 出力される」という順序問題が起きる。ここでは Button クラスを使わず、同じロジック(2回連続で
 * 同じ状態を読めたら確定させる)をボタンごとの真偽値グローバル変数だけでインライン展開している。
 */
export function registerGenerators(generator: Blockly.Generator, builder: SketchBuilder): void {
  generator.forBlock["spresense_instrument_setup"] = (block: Blockly.Block) => {
    // "Piano" / "Sax"。apps/editor/resources/instrument-sounds/<voice>/ に対応する
    // フォルダ名で、アプリの「SDカードに音源をコピー」機能が同じ名前でSDカードに複製する。
    const voice = block.getFieldValue("VOICE") as string;

    builder.addInclude("<SDSink.h>");

    const tableEntries = Object.entries(NOTE_TABLE)
      .map(([note, suffix]) => `    {${note}, "${voice}/${suffix}.wav"},`)
      .join("\n");
    const noteCount = Object.keys(NOTE_TABLE).length;
    builder.addGlobal(
      "instrument-table",
      `const SDSink::Item spresenseInstrumentTable[${noteCount}] = {\n${tableEntries}\n};`
    );
    builder.addGlobal(
      "instrument-instance",
      `SDSink spresenseInstrument(spresenseInstrumentTable, ${noteCount});`
    );

    builder.addSetup("serial-begin", "Serial.begin(115200);");
    builder.addSetup(
      "instrument-init",
      "if (!spresenseInstrument.begin()) {\n" +
        '    Serial.println("ゆる楽器の初期化に失敗しました。SDカードに音源ファイルがあるか確認してください。");\n' +
        "  }"
    );

    // SDSink::update() は音を鳴らし続けるために毎ループ呼ぶ必要がある(examplesのloop()と同じ)。
    return "spresenseInstrument.update();\n";
  };

  generator.forBlock["spresense_instrument_button"] = (block: Blockly.Block) => {
    const pin = block.getFieldValue("PIN") as string;
    const note = block.getFieldValue("NOTE") as string;

    builder.addInclude("<SDSink.h>");
    builder.addGlobal(`instrument-button-state:${pin}`, `int spresenseButton${pin}PrevStat = HIGH;`);
    builder.addSetup(`pinMode:${pin}`, `pinMode(${pin}, INPUT_PULLUP);`);

    // examples/ButtonDrum の Button::hasChanged()/isPressed() と同じロジック
    // (チャタリング防止のため、状態が変わって10マイクロ秒後にもう一度読み直して確定させる)を、
    // クラスを使わずインライン展開したもの。
    return (
      "{\n" +
      `    int buttonNow = digitalRead(${pin});\n` +
      `    if (spresenseButton${pin}PrevStat != buttonNow) {\n` +
      "      delayMicroseconds(10);\n" +
      `      if (buttonNow == digitalRead(${pin})) {\n` +
      `        spresenseButton${pin}PrevStat = buttonNow;\n` +
      "        if (buttonNow == LOW) {\n" +
      `          spresenseInstrument.sendNoteOn(${note}, DEFAULT_VELOCITY, DEFAULT_CHANNEL);\n` +
      "        } else {\n" +
      `          spresenseInstrument.sendNoteOff(${note}, DEFAULT_VELOCITY, DEFAULT_CHANNEL);\n` +
      "        }\n" +
      "      }\n" +
      "    }\n" +
      "  }\n"
    );
  };
}

/** 新しく作った Blockly.Generator に、次ブロックへの連結を行う scrub_ を設定する。 */
function setupChaining(generator: Blockly.Generator): void {
  generator.scrub_ = (block: Blockly.Block, code: string) => {
    const nextBlock = block.nextConnection?.targetBlock() ?? null;
    if (!nextBlock) {
      return code;
    }
    const nextCode = generator.blockToCode(nextBlock);
    return code + (typeof nextCode === "string" ? nextCode : nextCode[0]);
  };
}

/**
 * ワークスペース全体から最終的な .ino ソースを1つ組み立てる。
 * このパック単体でのテスト・動作確認用(実アプリでは apps/editor 側で
 * 他パックと合わせて1つの Blockly.Generator にまとめている)。
 */
export function generateSketch(workspace: Blockly.Workspace, builder: SketchBuilder): string {
  builder.reset();
  builder.addInclude("<Arduino.h>");

  const generator = new Blockly.Generator("Arduino");
  generator.INDENT = "  ";
  setupChaining(generator);
  registerGenerators(generator, builder);

  generator.init(workspace);
  for (const block of workspace.getTopBlocks(true)) {
    generator.blockToCode(block);
  }
  generator.finish("");

  return builder.build();
}
