import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { SketchBuilder } from "@spresense-blocks/codegen-core";
import { installBlocks, installMessages } from "../src/blocks.js";
import { generateSketch } from "../src/generators.js";

/** 「ゆる楽器を鳴らす(ピアノ)」の下に、D04=ド・D05=レ の2つのボタンを並べた、ButtonDrum相当の最小構成。 */
const BUTTON_DRUM_WORKSPACE_STATE = {
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
              fields: { VOICE: "Piano" },
              next: {
                block: {
                  type: "spresense_instrument_button",
                  id: "button1",
                  fields: { PIN: "PIN_D04", NOTE: "60" },
                  next: {
                    block: {
                      type: "spresense_instrument_button",
                      id: "button2",
                      fields: { PIN: "PIN_D05", NOTE: "62" },
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
};

describe("instrument generateSketch", () => {
  beforeAll(() => {
    installMessages();
    installBlocks();
  });

  it("turns a ButtonDrum-style block stack into a compilable-looking Arduino sketch", async () => {
    // spresense_forever は core-io パックのブロックなので、このテストでも定義しておく必要がある。
    const coreIo = await import("@spresense-blocks/block-pack-core-io");
    coreIo.installMessages();
    coreIo.installBlocks();

    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(BUTTON_DRUM_WORKSPACE_STATE, workspace);

    const builder = new SketchBuilder();
    const generator = new Blockly.Generator("Arduino");
    generator.INDENT = "  ";
    generator.scrub_ = (block: Blockly.Block, code: string) => {
      const nextBlock = block.nextConnection?.targetBlock() ?? null;
      if (!nextBlock) {
        return code;
      }
      const nextCode = generator.blockToCode(nextBlock);
      return code + (typeof nextCode === "string" ? nextCode : nextCode[0]);
    };
    coreIo.registerGenerators(generator, builder);
    const { registerGenerators } = await import("../src/generators.js");
    registerGenerators(generator, builder);

    builder.reset();
    builder.addInclude("<Arduino.h>");
    generator.init(workspace);
    for (const block of workspace.getTopBlocks(true)) {
      generator.blockToCode(block);
    }
    generator.finish("");
    const sketch = builder.build();

    expect(sketch).toContain("#include <SDSink.h>");
    expect(sketch).toContain('{48, "Piano/48_C3.wav"},');
    expect(sketch).toContain('{71, "Piano/71_B4.wav"},');
    expect(sketch).toContain("SDSink spresenseInstrument(spresenseInstrumentTable, 14);");
    expect(sketch).toContain("if (!spresenseInstrument.begin())");
    expect(sketch).toContain("pinMode(PIN_D04, INPUT_PULLUP);");
    expect(sketch).toContain("pinMode(PIN_D05, INPUT_PULLUP);");
    expect(sketch).toContain("int spresenseButtonPIN_D04PrevStat = HIGH;");
    expect(sketch).toContain("spresenseInstrument.sendNoteOn(60, DEFAULT_VELOCITY, DEFAULT_CHANNEL);");
    expect(sketch).toContain("spresenseInstrument.sendNoteOn(62, DEFAULT_VELOCITY, DEFAULT_CHANNEL);");
    expect(sketch).toContain("spresenseInstrument.update();");
  });

  it("uses the Sax voice folder when selected", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(
      {
        blocks: {
          languageVersion: 0,
          blocks: [
            {
              type: "spresense_instrument_setup",
              id: "setup1",
              fields: { VOICE: "Sax" },
            },
          ],
        },
      },
      workspace
    );

    const builder = new SketchBuilder();
    const sketch = generateSketch(workspace, builder);

    expect(sketch).toContain('{48, "Sax/48_C3.wav"},');
    expect(sketch).toContain('{71, "Sax/71_B4.wav"},');
  });
});
