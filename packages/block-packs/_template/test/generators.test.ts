import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { SketchBuilder } from "@spresense-blocks/codegen-core";
import { installBlocks, installMessages } from "../src/blocks.js";
import { registerGenerators } from "../src/generators.js";

/**
 * このパック単体には statement ブロックを loop() に取り込む「ずっと」のような
 * 入れ物ブロックが無い(core-io側が提供しているため)。そのため、他パックのテスト
 * (core-io/test/generators.test.ts の BLINK_WORKSPACE_STATE 等)のようにフルの
 * .ino 組み立てを検証する代わりに、sensor-addonパックのテストと同じように
 * `generator.forBlock[type]` を直接呼び出して、返り値とSketchBuilderへの副作用の
 * 両方を確認する。実際のアプリでは、この action ブロックは「ずっと」の中に置かれて
 * 初めて loop() に反映される。
 */
describe("_template generators", () => {
  beforeAll(() => {
    installMessages();
    installBlocks();
  });

  it("action block writes pinMode to setup and returns the digitalWrite line", () => {
    const workspace = new Blockly.Workspace();
    const generator = new Blockly.Generator("Arduino");
    const builder = new SketchBuilder();
    registerGenerators(generator, builder);

    const block = workspace.newBlock("spresense_template_action");
    block.setFieldValue("PIN_D02", "PIN");
    block.setFieldValue("HIGH", "STATE");

    const code = generator.forBlock["spresense_template_action"](block, generator) as string;

    expect(code).toBe("digitalWrite(PIN_D02, HIGH);\n");
    expect(builder.build()).toContain("pinMode(PIN_D02, OUTPUT);");
  });

  it("value block returns a [code, order] tuple", () => {
    const workspace = new Blockly.Workspace();
    const generator = new Blockly.Generator("Arduino");
    const builder = new SketchBuilder();
    registerGenerators(generator, builder);

    const block = workspace.newBlock("spresense_template_value");
    block.setFieldValue("PIN_D03", "PIN");

    const [code, order] = generator.forBlock["spresense_template_value"](block, generator) as [string, number];

    expect(code).toBe("digitalRead(PIN_D03)");
    expect(order).toBe(0);
  });
});
