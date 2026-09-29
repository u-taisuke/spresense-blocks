import * as Blockly from "blockly/core";
import { SketchBuilder } from "@spresense-blocks/codegen-core";
import { registerGenerators as registerCoreIoGenerators } from "@spresense-blocks/block-pack-core-io";
import { registerGenerators as registerSensorAddonGenerators } from "@spresense-blocks/block-pack-sensor-addon";

/**
 * アプリ全体で使う唯一の Blockly.Generator を組み立てる。
 *
 * 各ブロックパックは自分の `forBlock` をこの1つの共有インスタンスに登録するだけ
 * (`registerGenerators`)。`Blockly.Generator` 自体の生成や、次ブロックへの連結
 * (`scrub_`)はここでまとめて行う。
 *
 * 新しいブロックパックを追加したら、import を足して register...Generators(...) を
 * 1行呼ぶだけでよい(docs/adding-a-block-pack.md 参照)。
 */
function createGenerator(builder: SketchBuilder): Blockly.Generator {
  const generator = new Blockly.Generator("Arduino");
  generator.INDENT = "  ";
  // Blockly.Generator の既定の scrub_ は素通しで、次ブロックへの連結を行わない
  // (JavaScript/Python等の言語別ジェネレータが各自 scrub_ で実装している処理)。
  generator.scrub_ = (block: Blockly.Block, code: string) => {
    const nextBlock = block.nextConnection?.targetBlock() ?? null;
    if (!nextBlock) {
      return code;
    }
    const nextCode = generator.blockToCode(nextBlock);
    return code + (typeof nextCode === "string" ? nextCode : nextCode[0]);
  };

  registerCoreIoGenerators(generator, builder);
  registerSensorAddonGenerators(generator, builder);

  return generator;
}

/**
 * ワークスペース全体から最終的な .ino ソースを1つ組み立てる。
 * builder は毎回 reset() されるので、呼び出し側で使い回してよい。
 */
export function generateSketch(workspace: Blockly.Workspace, builder: SketchBuilder): string {
  builder.reset();
  builder.addInclude("<Arduino.h>");

  const generator = createGenerator(builder);
  generator.init(workspace);
  for (const block of workspace.getTopBlocks(true)) {
    generator.blockToCode(block);
  }
  generator.finish("");

  return builder.build();
}
