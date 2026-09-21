import * as Blockly from "blockly/core";
import { SketchBuilder } from "@spresense-blocks/codegen-core";

/** 値ブロックの演算優先順位。今のところ演算子の入れ子がない(比較は常に最上位)ため、全部同じ「最優先」でよい。 */
const ORDER_ATOMIC = 0;

const COMPARE_OPERATORS: Record<string, string> = {
  EQ: "==",
  NEQ: "!=",
  GT: ">",
  LT: "<",
  GTE: ">=",
  LTE: "<=",
};

/**
 * core-io パックのブロック用コード生成関数を、渡された SketchBuilder に
 * 副作用として書き込む Blockly.Generator を組み立てる。
 *
 * 生成関数自体は「このブロックの1行(または空文字)」を返すだけの薄いものにし、
 * include/setup 行の登録のような「重複してはいけない」情報だけを
 * builder.addInclude / builder.addSetup に直接書き込む。
 * これにより、最終的なファイル構成(#include の並び順、setup/loopの組み立て)は
 * 常に SketchBuilder 側だけが決める、という責務分担を保つ。
 */
export function createArduinoGenerator(builder: SketchBuilder): Blockly.Generator {
  const generator = new Blockly.Generator("Arduino");
  generator.INDENT = "  ";
  // Blockly.Generator の既定の scrub_ は素通し(コードをそのまま返すだけ)で、
  // 「次に接続されたブロックのコードをつなげる」処理は行わない
  // (JavaScript/Python等の言語別ジェネレータが各自 scrub_ で実装している処理)。
  // そのため、この Arduino 用ジェネレータでも自前で次ブロックへ連結する。
  generator.scrub_ = (block: Blockly.Block, code: string) => {
    const nextBlock = block.nextConnection?.targetBlock() ?? null;
    if (!nextBlock) {
      return code;
    }
    const nextCode = generator.blockToCode(nextBlock);
    return code + (typeof nextCode === "string" ? nextCode : nextCode[0]);
  };

  // 変数ブロックの「表示名(自由入力・日本語も可)」→「安全なC++識別子」の対応表。
  // C++の識別子として不正な文字(日本語・空白等)をそのまま出力しないための変換で、
  // 1回の generateSketch() 呼び出し内(=このジェネレータのインスタンス)でだけ一貫していればよい。
  const variableNames = new Map<string, string>();
  function safeVariableName(displayName: string): string {
    const existing = variableNames.get(displayName);
    if (existing) {
      return existing;
    }
    const safeName = `userVar${variableNames.size}`;
    variableNames.set(displayName, safeName);
    return safeName;
  }

  generator.forBlock["spresense_forever"] = (block: Blockly.Block) => {
    const branch = generator.statementToCode(block, "DO");
    for (const rawLine of branch.split("\n")) {
      const line = rawLine.trim();
      if (line) {
        builder.addLoop(line);
      }
    }
    return "";
  };

  generator.forBlock["spresense_onboard_led_set"] = (block: Blockly.Block) => {
    const led = block.getFieldValue("LED") as string;
    const state = block.getFieldValue("STATE") as string;
    builder.addSetup(`pinMode:${led}`, `pinMode(${led}, OUTPUT);`);
    return `digitalWrite(${led}, ${state});\n`;
  };

  generator.forBlock["spresense_wait_ms"] = (block: Blockly.Block) => {
    const ms = Number(block.getFieldValue("MS"));
    return `delay(${ms});\n`;
  };

  generator.forBlock["spresense_digital_write"] = (block: Blockly.Block) => {
    const pin = block.getFieldValue("PIN") as string;
    const state = block.getFieldValue("STATE") as string;
    builder.addSetup(`pinMode:${pin}`, `pinMode(${pin}, OUTPUT);`);
    return `digitalWrite(${pin}, ${state});\n`;
  };

  generator.forBlock["spresense_pwm_write"] = (block: Blockly.Block) => {
    const pin = block.getFieldValue("PIN") as string;
    const value = generator.valueToCode(block, "VALUE", ORDER_ATOMIC) || "0";
    // analogWrite() は内部で必要なピン設定を行う(ソフトウェアPWMは自動でOUTPUTにする、
    // 専用ハードウェアPWMピンはPWMデバイス経由で自前設定する)ため、ここで pinMode は呼ばない。
    return `analogWrite(${pin}, ${value});\n`;
  };

  generator.forBlock["spresense_digital_read"] = (block: Blockly.Block): [string, number] => {
    const pin = block.getFieldValue("PIN") as string;
    builder.addSetup(`pinMode:${pin}`, `pinMode(${pin}, INPUT);`);
    return [`(digitalRead(${pin}) == HIGH)`, ORDER_ATOMIC];
  };

  generator.forBlock["spresense_analog_read"] = (block: Blockly.Block): [string, number] => {
    const pin = block.getFieldValue("PIN") as string;
    return [`analogRead(${pin})`, ORDER_ATOMIC];
  };

  generator.forBlock["spresense_repeat_times"] = (block: Blockly.Block) => {
    const times = Math.max(0, Math.floor(Number(block.getFieldValue("TIMES"))));
    const branch = generator.statementToCode(block, "DO");
    return `for (int i = 0; i < ${times}; i++) {\n${branch}}\n`;
  };

  generator.forBlock["spresense_if"] = (block: Blockly.Block) => {
    const condition = generator.valueToCode(block, "CONDITION", ORDER_ATOMIC) || "false";
    const branch = generator.statementToCode(block, "DO");
    return `if (${condition}) {\n${branch}}\n`;
  };

  generator.forBlock["spresense_compare"] = (block: Blockly.Block): [string, number] => {
    const a = generator.valueToCode(block, "A", ORDER_ATOMIC) || "0";
    const b = generator.valueToCode(block, "B", ORDER_ATOMIC) || "0";
    const op = COMPARE_OPERATORS[block.getFieldValue("OP") as string] ?? "==";
    return [`(${a} ${op} ${b})`, ORDER_ATOMIC];
  };

  generator.forBlock["spresense_number"] = (block: Blockly.Block): [string, number] => {
    const value = Number(block.getFieldValue("NUM"));
    return [String(value), ORDER_ATOMIC];
  };

  generator.forBlock["spresense_variable_set"] = (block: Blockly.Block) => {
    const displayName = block.getFieldValue("NAME") as string;
    const safeName = safeVariableName(displayName);
    const value = generator.valueToCode(block, "VALUE", ORDER_ATOMIC) || "0";
    builder.addGlobal(`var:${safeName}`, `float ${safeName} = 0;`);
    return `${safeName} = ${value};\n`;
  };

  generator.forBlock["spresense_variable_get"] = (block: Blockly.Block): [string, number] => {
    const displayName = block.getFieldValue("NAME") as string;
    const safeName = safeVariableName(displayName);
    builder.addGlobal(`var:${safeName}`, `float ${safeName} = 0;`);
    return [safeName, ORDER_ATOMIC];
  };

  return generator;
}

/**
 * ワークスペース全体から最終的な .ino ソースを1つ組み立てる。
 * builder は毎回 reset() されるので、呼び出し側で使い回してよい。
 */
export function generateSketch(workspace: Blockly.Workspace, builder: SketchBuilder): string {
  builder.reset();
  builder.addInclude("<Arduino.h>");

  const generator = createArduinoGenerator(builder);
  generator.init(workspace);
  for (const block of workspace.getTopBlocks(true)) {
    generator.blockToCode(block);
  }
  generator.finish("");

  return builder.build();
}
