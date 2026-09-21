import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { SketchBuilder } from "@spresense-blocks/codegen-core";
import { installBlocks, installMessages } from "../src/blocks.js";
import { generateSketch } from "../src/generators.js";

function loadAndGenerate(forDoBlockState: Record<string, unknown>): string {
  const state = {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: "spresense_forever",
          id: "forever1",
          inputs: { DO: { block: forDoBlockState } },
        },
      ],
    },
  };
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, workspace);
  return generateSketch(workspace, new SketchBuilder());
}

describe("core-io additional blocks", () => {
  beforeAll(() => {
    installMessages();
    installBlocks();
  });

  it("digital write registers pinMode(OUTPUT) and emits digitalWrite", () => {
    const code = loadAndGenerate({
      type: "spresense_digital_write",
      id: "dw1",
      fields: { PIN: "PIN_D02", STATE: "HIGH" },
    });

    expect(code).toContain("pinMode(PIN_D02, OUTPUT);");
    expect(code).toContain("digitalWrite(PIN_D02, HIGH);");
  });

  it("pwm write emits analogWrite without an extra pinMode line", () => {
    const code = loadAndGenerate({
      type: "spresense_pwm_write",
      id: "pwm1",
      fields: { PIN: "PIN_D06" },
      inputs: { VALUE: { block: { type: "spresense_number", id: "n1", fields: { NUM: 128 } } } },
    });

    expect(code).toContain("analogWrite(PIN_D06, 128);");
    expect(code).not.toContain("pinMode(PIN_D06");
  });

  it("digital read inside an if-block registers pinMode(INPUT) and generates a boolean expression", () => {
    const code = loadAndGenerate({
      type: "spresense_if",
      id: "if1",
      inputs: {
        CONDITION: {
          block: { type: "spresense_digital_read", id: "dr1", fields: { PIN: "PIN_D03" } },
        },
        DO: {
          block: {
            type: "spresense_onboard_led_set",
            id: "led1",
            fields: { LED: "LED0", STATE: "HIGH" },
          },
        },
      },
    });

    expect(code).toContain("pinMode(PIN_D03, INPUT);");
    expect(code).toContain("if ((digitalRead(PIN_D03) == HIGH)) {");
    expect(code).toContain("digitalWrite(LED0, HIGH);");
  });

  it("analog read + compare produces a numeric comparison inside an if-block", () => {
    const code = loadAndGenerate({
      type: "spresense_if",
      id: "if2",
      inputs: {
        CONDITION: {
          block: {
            type: "spresense_compare",
            id: "cmp1",
            fields: { OP: "GT" },
            inputs: {
              A: { block: { type: "spresense_analog_read", id: "ar1", fields: { PIN: "A0" } } },
              B: { block: { type: "spresense_number", id: "n2", fields: { NUM: 500 } } },
            },
          },
        },
        DO: { block: { type: "spresense_wait_ms", id: "wait1", fields: { MS: 10 } } },
      },
    });

    expect(code).toContain("if ((analogRead(A0) > 500)) {");
    expect(code).toContain("delay(10);");
  });

  it("repeat N times wraps the branch in a for-loop", () => {
    const code = loadAndGenerate({
      type: "spresense_repeat_times",
      id: "rep1",
      fields: { TIMES: 3 },
      inputs: {
        DO: { block: { type: "spresense_wait_ms", id: "wait2", fields: { MS: 100 } } },
      },
    });

    expect(code).toContain("for (int i = 0; i < 3; i++) {");
    expect(code).toContain("delay(100);");
  });

  it("variables map the same display name to the same safe C++ identifier", () => {
    const code = loadAndGenerate({
      type: "spresense_variable_set",
      id: "set1",
      fields: { NAME: "カウント" },
      inputs: { VALUE: { block: { type: "spresense_number", id: "n3", fields: { NUM: 0 } } } },
      next: {
        block: {
          type: "spresense_variable_set",
          id: "set2",
          fields: { NAME: "べつのへんすう" },
          inputs: {
            VALUE: { block: { type: "spresense_variable_get", id: "get1", fields: { NAME: "カウント" } } },
          },
        },
      },
    });

    expect(code).toContain("float userVar0 = 0;");
    expect(code).toContain("float userVar1 = 0;");
    expect(code).toContain("userVar0 = 0;");
    expect(code).toContain("userVar1 = userVar0;");
  });
});
