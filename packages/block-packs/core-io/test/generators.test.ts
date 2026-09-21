import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { SketchBuilder } from "@spresense-blocks/codegen-core";
import { installBlocks, installMessages } from "../src/blocks.js";
import { generateSketch } from "../src/generators.js";

/** 「LED0を点ける→500ms待つ→LED0を消す→500ms待つ」を ずっと 繰り返す、定番のLチカ構成。 */
const BLINK_WORKSPACE_STATE = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: "spresense_forever",
        id: "forever1",
        inputs: {
          DO: {
            block: {
              type: "spresense_onboard_led_set",
              id: "led_on",
              fields: { LED: "LED0", STATE: "HIGH" },
              next: {
                block: {
                  type: "spresense_wait_ms",
                  id: "wait1",
                  fields: { MS: 500 },
                  next: {
                    block: {
                      type: "spresense_onboard_led_set",
                      id: "led_off",
                      fields: { LED: "LED0", STATE: "LOW" },
                      next: {
                        block: {
                          type: "spresense_wait_ms",
                          id: "wait2",
                          fields: { MS: 500 },
                        },
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
};

describe("core-io generateSketch", () => {
  beforeAll(() => {
    installMessages();
    installBlocks();
  });

  it("turns a blink block stack into a compilable-looking Arduino sketch", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(BLINK_WORKSPACE_STATE, workspace);

    const builder = new SketchBuilder();
    const code = generateSketch(workspace, builder);

    expect(code).toContain("#include <Arduino.h>");
    expect(code).toContain("void setup() {\n  pinMode(LED0, OUTPUT);\n}");
    expect(code).toContain(
      "void loop() {\n" +
        "  digitalWrite(LED0, HIGH);\n" +
        "  delay(500);\n" +
        "  digitalWrite(LED0, LOW);\n" +
        "  delay(500);\n" +
        "}"
    );
  });

  it("resets builder state between successive generations (no leftover setup/loop lines)", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(BLINK_WORKSPACE_STATE, workspace);
    const builder = new SketchBuilder();

    generateSketch(workspace, builder);
    workspace.clear();

    const emptyCode = generateSketch(workspace, builder);
    expect(emptyCode).not.toContain("pinMode");
    expect(emptyCode).not.toContain("digitalWrite");
  });
});
