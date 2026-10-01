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
 * 「大きさ」(0〜100、Scratch等のボリューム感覚に合わせた目盛り)を、
 * ssprocLib(SDSink)が実際に受け取るセンチベル値(-1020〜+120、0が元の音量)に変換する。
 * 100 → 0(元の音量)、0 → -1020(ほぼ無音)になるよう線形に対応させている。
 * +120(ブースト)側は使わない(歪みの原因になりやすいため)。
 */
function volumeToCentibels(volume: number): number {
  return Math.round(((volume - 100) * 1020) / 100);
}

/**
 * 「音を鳴らす」「和音を鳴らす」どちらも使う、共通の鳴らす処理のコード片を組み立てる。
 * 渡した全てのノートが今鳴っていない(`spresenseNoteStopAt[note] == 0`)ときだけ、
 * まとめて鳴らし始める(和音の場合、片方だけ鳴っている状態で片方だけ鳴らし直す、という
 * ズレを避けるため)。
 */
function buildPlayCode(notes: string[], durationMs: number, volume: number): string {
  const centibels = volumeToCentibels(volume);
  const condition = notes.map((note) => `spresenseNoteStopAt[${note}] == 0`).join(" && ");

  const lines = [`if (${condition}) {`, `    spresenseInstrument.setParam(Filter::PARAMID_OUTPUT_LEVEL, ${centibels});`];
  for (const note of notes) {
    lines.push(`    spresenseInstrument.sendNoteOn(${note}, DEFAULT_VELOCITY, DEFAULT_CHANNEL);`);
    lines.push(`    spresenseNoteStopAt[${note}] = millis() + ${durationMs};`);
  }
  lines.push("  }");

  return lines.join("\n") + "\n";
}

/**
 * instrument パック(Sony公式 ssprocLib を使った「ゆる楽器」)のブロック用コード生成関数を、
 * 渡された Blockly.Generator に登録する。
 *
 * `generator` はアプリ全体で1つだけ作られる共有インスタンスを想定している
 * (core-io など他のブロックパックのブロックと同じワークスペースに混在するため)。
 * このパックはここで自分の `forBlock` を登録するだけで、
 * `Blockly.Generator` 自体の生成や `scrub_` の設定は呼び出し側(アプリ)の責任にする。
 *
 * **設計メモ(ボタン入力を自前で持たない理由)**: 以前は「ボタン(ピン)を押している間〜音を鳴らす」
 * という、ボタン検知と音を1つのブロックにまとめていたが、ピンの状態を調べる機能は
 * core-io パックの「デジタルピンがONになっている」+「もし〜なら」で既にできるため、
 * このパックは「音を鳴らす」ことだけに専念する設計に変更した。そのため、「音を鳴らす」ブロックは
 * ボタンの押しっぱなし(レベル)検知ではなく、呼ばれるたびに「今鳴っていなければ鳴らす」
 * (`spresenseNoteStopAt[note]` が0=鳴っていない、を見て判定)という単純な引き金として働く。
 * 鳴らした音は、このブロック自身に書かれた長さ(ミリ秒)が経過すると自動的に止まる。
 * この「経過時間チェック」は `spresense_instrument_setup` ブロックが毎ループ無条件で実行する
 * コード(`spresenseInstrument.update()`と同じ場所)に組み込んである。こうすることで、
 * 「音を鳴らす」ブロックが(ボタンが離されて)呼ばれなくなった後でも、設定した長さぴったりで
 * 音を止められる(呼ばれたときだけ判定するのでは、ボタンを離したタイミングでしか止められない)。
 *
 * **設計メモ(「大きさ」が全体の音量である理由)**: ssprocLibの `SDSink` は、ノートごとの音量
 * (MIDIのvelocity)を実際には使っていない(`sendNoteOn`のvelocity引数は「0なら音を止める」判定に
 * しか使われない、`SDSink.cpp`で確認済み)。音量を変えられる唯一の方法は
 * `setParam(Filter::PARAMID_OUTPUT_LEVEL, ...)`で、これはSDSinkインスタンス全体(鳴っている
 * すべての音)にかかる共通の音量つまみ。そのため「音を鳴らす」ブロックの「大きさ」は、
 * このブロックの音だけでなく、同時に鳴っている他の音の大きさも一緒に変えてしまう
 * (ブロックのtooltipで明記している)。
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
    builder.addGlobal("instrument-note-stop-at", "unsigned long spresenseNoteStopAt[128] = {0};");

    builder.addSetup("serial-begin", "Serial.begin(115200);");
    builder.addSetup(
      "instrument-init",
      "if (!spresenseInstrument.begin()) {\n" +
        '    Serial.println("ゆる楽器の初期化に失敗しました。SDカードに音源ファイルがあるか確認してください。");\n' +
        "  }"
    );

    // SDSink::update() は音を鳴らし続けるために毎ループ呼ぶ必要がある(examplesのloop()と同じ)。
    // 続けて、設定した長さ(spresenseNoteStopAt)を過ぎた音を止める処理も毎ループ行う
    // (「音を鳴らす」ブロックが呼ばれるかどうかに関係なく、時間になったら自動で止めるため)。
    return (
      "spresenseInstrument.update();\n" +
      "for (int i = 0; i < 128; i++) {\n" +
      "    if (spresenseNoteStopAt[i] != 0 && millis() >= spresenseNoteStopAt[i]) {\n" +
      "      spresenseInstrument.sendNoteOff(i, DEFAULT_VELOCITY, DEFAULT_CHANNEL);\n" +
      "      spresenseNoteStopAt[i] = 0;\n" +
      "    }\n" +
      "  }\n"
    );
  };

  generator.forBlock["spresense_instrument_play_note"] = (block: Blockly.Block) => {
    const note = block.getFieldValue("NOTE") as string;
    const durationMs = Math.max(0, Math.floor(Number(block.getFieldValue("DURATION_MS"))));
    const volume = Math.min(100, Math.max(0, Math.floor(Number(block.getFieldValue("VOLUME")))));

    builder.addInclude("<SDSink.h>");
    builder.addGlobal("instrument-note-stop-at", "unsigned long spresenseNoteStopAt[128] = {0};");

    // 既に鳴っている音は、自然に止まる(spresenseNoteStopAt[note]が0に戻る)まで鳴らし直さない。
    // これにより、「もし(ボタンが押されている)なら 音を鳴らす」のように毎ループ呼ばれても、
    // ブツブツと音が途切れず、設定した長さぶん自然に鳴り続ける。
    return buildPlayCode([note], durationMs, volume);
  };

  generator.forBlock["spresense_instrument_play_chord"] = (block: Blockly.Block) => {
    const note1 = block.getFieldValue("NOTE1") as string;
    const note2 = block.getFieldValue("NOTE2") as string;
    const durationMs = Math.max(0, Math.floor(Number(block.getFieldValue("DURATION_MS"))));
    const volume = Math.min(100, Math.max(0, Math.floor(Number(block.getFieldValue("VOLUME")))));

    builder.addInclude("<SDSink.h>");
    builder.addGlobal("instrument-note-stop-at", "unsigned long spresenseNoteStopAt[128] = {0};");

    // 2音とも今鳴っていないときだけ、まとめて鳴らし始める(「音を鳴らす」と同じ判定をノートの数だけ行う)。
    return buildPlayCode([note1, note2], durationMs, volume);
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
