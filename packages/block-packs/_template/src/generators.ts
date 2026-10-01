/**
 * ★新しいブロックパックを作るときのひな形です。★ 詳しくは blocks.ts のコメントを参照。
 */
import * as Blockly from "blockly/core";
import { SketchBuilder } from "@spresense-blocks/codegen-core";

const ORDER_ATOMIC = 0;

/**
 * このパックのブロック用コード生成関数を、渡された Blockly.Generator に登録する。
 *
 * `generator` はアプリ全体で1つだけ作られる共有インスタンス(他パックのブロックとも
 * 同じワークスペースに混在する)。このパックはここで自分の `forBlock` を登録するだけでよい。
 * `Blockly.Generator` 自体の生成や `scrub_`(次ブロックへの連結)の設定は
 * 呼び出し側(`apps/editor/src/renderer/src/codegen.ts`)の責任なので、ここではやらない。
 */
export function registerGenerators(generator: Blockly.Generator, builder: SketchBuilder): void {
  // --- statement(動作)ブロックの例 ---
  generator.forBlock["spresense_template_action"] = (block: Blockly.Block) => {
    const pin = block.getFieldValue("PIN") as string;
    const state = block.getFieldValue("STATE") as string;

    // #include が必要なら addInclude、初期化(pinMode等)が必要なら addSetup を副作用として呼ぶ。
    // addSetup は同じキーで何度呼んでも1回しか出力されない(同じピンを複数ブロックが使っても安全)。
    builder.addSetup(`pinMode:${pin}`, `pinMode(${pin}, OUTPUT);`);

    // statementブロックの戻り値は「このブロック1行分のコード」の文字列。
    // 末尾の改行は付けてもつけなくてもSketchBuilder側で吸収されるが、既存パックに合わせておく。
    return `digitalWrite(${pin}, ${state});\n`;
  };

  // --- value(値を返す)ブロックの例 ---
  generator.forBlock["spresense_template_value"] = (block: Blockly.Block): [string, number] => {
    const pin = block.getFieldValue("PIN") as string;

    // valueブロックの戻り値は [式の文字列, 演算優先順位] のタプル。
    // 今のところこのプロジェクトには演算子の入れ子が無いので、常に ORDER_ATOMIC でよい
    // (core-ioの比較ブロックなどを参照)。
    return [`digitalRead(${pin})`, ORDER_ATOMIC];
  };
}

/** 新しく作った Blockly.Generator に、次ブロックへの連結を行う scrub_ を設定する。 */
function setupChaining(generator: Blockly.Generator): void {
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
