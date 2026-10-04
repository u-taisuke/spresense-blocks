import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { installBlocks as installCoreIoBlocks, installMessages as installCoreIoMessages } from "@spresense-blocks/block-pack-core-io";
import { adjacentField, collectEditableFields, fieldForSelectedBlock } from "../src/renderer/src/tabNavigation";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** 欄を「ブロックの種類(spresense_ は省略).欄の名前」で表す。 */
function describeField(field: Blockly.Field): string {
  return `${field.getSourceBlock()!.type.replace("spresense_", "")}.${field.name}`;
}

function loadSample(file: string): Blockly.Workspace {
  const project = JSON.parse(readFileSync(join(REPO_ROOT, "samples", file), "utf8")) as { workspace: unknown };
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(project.workspace as never, workspace);
  return workspace;
}

describe("Tabキーでの入力欄の移動順", () => {
  beforeAll(() => {
    if (!Blockly.Blocks["spresense_forever"]) {
      installCoreIoMessages();
      installCoreIoBlocks();
    }
  });

  it("orders fields in reading order: left to right inside a block, then nested and following blocks top to bottom", () => {
    const workspace = loadSample("06_ボタンでLEDを点ける.sprsb");

    expect(collectEditableFields(workspace).map(describeField)).toEqual([
      // 変数 押した を 0 にする
      "variable_set.NAME",
      "number.NUM",
      // もし デジタルピン D04 がON なら 変数 押した を 1 にする
      "digital_read.PIN",
      "variable_set.NAME",
      "number.NUM",
      // もし 変数 押した = 1 なら LED0 を 点ける
      "variable_get.NAME",
      "compare.OP",
      "number.NUM",
      "onboard_led_set.LED",
      "onboard_led_set.STATE",
      // もし 変数 押した = 0 なら LED0 を 消す
      "variable_get.NAME",
      "compare.OP",
      "number.NUM",
      "onboard_led_set.LED",
      "onboard_led_set.STATE",
    ]);
  });

  it("visits separate block stacks from top to bottom", () => {
    const workspace = new Blockly.Workspace();
    const lower = workspace.newBlock("spresense_wait_ms");
    lower.moveBy(20, 300);
    const upper = workspace.newBlock("spresense_onboard_led_set");
    upper.moveBy(20, 20);

    expect(collectEditableFields(workspace).map(describeField)).toEqual([
      "onboard_led_set.LED",
      "onboard_led_set.STATE",
      "wait_ms.MS",
    ]);
  });

  it("wraps around at both ends", () => {
    const workspace = loadSample("01_Lチカ.sprsb");
    const fields = collectEditableFields(workspace);
    const first = fields[0];
    const last = fields[fields.length - 1];

    expect(adjacentField(fields, last, true)).toBe(first);
    expect(adjacentField(fields, first, false)).toBe(last);
    expect(adjacentField(fields, first, true)).toBe(fields[1]);
  });

  it("starts from the selected block's own first (or last) field", () => {
    const workspace = loadSample("06_ボタンでLEDを点ける.sprsb");
    const fields = collectEditableFields(workspace);
    const ledBlock = workspace.getBlocksByType("spresense_onboard_led_set", true)[0];
    const ifBlock = ledBlock.getSurroundParent()!;

    expect(describeField(fieldForSelectedBlock(fields, ledBlock, true)!)).toBe("onboard_led_set.LED");
    expect(describeField(fieldForSelectedBlock(fields, ledBlock, false)!)).toBe("onboard_led_set.STATE");
    // 「もし〜なら」を選んだときは、条件の中の最初の欄から。
    expect(describeField(fieldForSelectedBlock(fields, ifBlock, true)!)).toBe("variable_get.NAME");
    // 入力欄の無い「ずっと」を選んだときは、全体の最初の欄から。
    const forever = workspace.getBlocksByType("spresense_forever", false)[0];
    expect(fieldForSelectedBlock(fields, forever, true)).toBe(fields[0]);
  });
});
