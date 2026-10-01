import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { SketchBuilder } from "@spresense-blocks/codegen-core";
import { installBlocks, installMessages } from "../src/blocks.js";
import { registerGenerators } from "../src/generators.js";

/**
 * 単体のstatementブロックは、「ずっと」のような入れ物ブロックの中に置かれて初めて
 * loop()に反映される(SketchBuilderの戻り値キャプチャの仕組み上)。このパック単体のテストでは
 * 入れ物が無いので、sensor-addon/_templateパックのテストと同様に `generator.forBlock[type]` を
 * 直接呼び出して、返り値(このブロック1行分のコード)とSketchBuilderへの副作用
 * (include/global/setup)の両方を確認する。
 */
function createGeneratorAndBuilder(): { generator: Blockly.Generator; builder: SketchBuilder } {
  const generator = new Blockly.Generator("Arduino");
  generator.INDENT = "  ";
  const builder = new SketchBuilder();
  registerGenerators(generator, builder);
  return { generator, builder };
}

describe("instrument generators", () => {
  beforeAll(() => {
    installMessages();
    installBlocks();
  });

  it("setup block declares the table/instance/expiry-check, and runs update()+expiry check every loop", () => {
    const workspace = new Blockly.Workspace();
    const { generator, builder } = createGeneratorAndBuilder();
    const block = workspace.newBlock("spresense_instrument_setup");
    block.setFieldValue("Piano", "VOICE");

    const code = generator.forBlock["spresense_instrument_setup"](block, generator) as string;

    expect(code).toContain("spresenseInstrument.update();");
    expect(code).toContain("for (int i = 0; i < 128; i++)");
    expect(code).toContain("spresenseInstrument.sendNoteOff(i, DEFAULT_VELOCITY, DEFAULT_CHANNEL);");

    const sketch = builder.build();
    expect(sketch).toContain('{48, "Piano/48_C3.wav"},');
    expect(sketch).toContain('{71, "Piano/71_B4.wav"},');
    expect(sketch).toContain("SDSink spresenseInstrument(spresenseInstrumentTable, 14);");
    expect(sketch).toContain("unsigned long spresenseNoteStopAt[128] = {0};");
    expect(sketch).toContain("if (!spresenseInstrument.begin())");
  });

  it("play_note block sets the shared volume, triggers sendNoteOn, and records a note-specific duration", () => {
    const workspace = new Blockly.Workspace();
    const { generator, builder } = createGeneratorAndBuilder();
    const block = workspace.newBlock("spresense_instrument_play_note");
    block.setFieldValue("60", "NOTE");
    block.setFieldValue(800, "DURATION_MS");
    block.setFieldValue(100, "VOLUME");

    const code = generator.forBlock["spresense_instrument_play_note"](block, generator) as string;

    expect(code).toContain("if (spresenseNoteStopAt[60] == 0) {");
    // VOLUME=100(最大)はセンチベル0(元の音量)に変換される。
    expect(code).toContain("spresenseInstrument.setParam(Filter::PARAMID_OUTPUT_LEVEL, 0);");
    expect(code).toContain("spresenseInstrument.sendNoteOn(60, DEFAULT_VELOCITY, DEFAULT_CHANNEL);");
    expect(code).toContain("spresenseNoteStopAt[60] = millis() + 800;");

    expect(builder.build()).toContain("unsigned long spresenseNoteStopAt[128] = {0};");
  });

  it("maps VOLUME=0 to the quietest centibel value", () => {
    const workspace = new Blockly.Workspace();
    const { generator } = createGeneratorAndBuilder();
    const block = workspace.newBlock("spresense_instrument_play_note");
    block.setFieldValue("62", "NOTE");
    block.setFieldValue(0, "VOLUME");

    const code = generator.forBlock["spresense_instrument_play_note"](block, generator) as string;

    expect(code).toContain("spresenseInstrument.setParam(Filter::PARAMID_OUTPUT_LEVEL, -1020);");
  });

  it("works together with core-io's digital-read + if blocks for button sensing", async () => {
    // このパックはボタン自体を扱わない設計なので、core-io の「デジタルピンがONになっている」+
    // 「もし〜なら」と組み合わせて使うのが想定の使い方。実際に組み合わせて壊れないことを確認する。
    const coreIo = await import("@spresense-blocks/block-pack-core-io");
    coreIo.installMessages();
    coreIo.installBlocks();

    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(
      {
        blocks: {
          languageVersion: 0,
          blocks: [
            {
              type: "spresense_forever",
              id: "forever1",
              inputs: {
                DO: {
                  block: {
                    type: "spresense_instrument_setup",
                    id: "setup1",
                    fields: { VOICE: "Sax" },
                    next: {
                      block: {
                        type: "spresense_if",
                        id: "if1",
                        inputs: {
                          CONDITION: {
                            block: {
                              type: "spresense_digital_read",
                              id: "dr1",
                              fields: { PIN: "PIN_D04" },
                            },
                          },
                          DO: {
                            block: {
                              type: "spresense_instrument_play_note",
                              id: "play1",
                              fields: { NOTE: "60" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
      workspace
    );

    const builder = new SketchBuilder();
    const generator = new Blockly.Generator("Arduino");
    generator.INDENT = "  ";
    generator.scrub_ = (block: Blockly.Block, code: string) => {
      const nextBlock = block.nextConnection?.targetBlock() ?? null;
      if (!nextBlock) return code;
      const nextCode = generator.blockToCode(nextBlock);
      return code + (typeof nextCode === "string" ? nextCode : nextCode[0]);
    };
    coreIo.registerGenerators(generator, builder);
    registerGenerators(generator, builder);

    builder.reset();
    builder.addInclude("<Arduino.h>");
    generator.init(workspace);
    for (const block of workspace.getTopBlocks(true)) {
      generator.blockToCode(block);
    }
    generator.finish("");
    const sketch = builder.build();

    expect(sketch).toContain("pinMode(PIN_D04, INPUT);");
    expect(sketch).toContain("if ((digitalRead(PIN_D04) == HIGH)) {");
    expect(sketch).toContain("spresenseInstrument.sendNoteOn(60, DEFAULT_VELOCITY, DEFAULT_CHANNEL);");
  });
});
