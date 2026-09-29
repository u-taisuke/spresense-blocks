import * as Blockly from "blockly/core";
import { SketchBuilder } from "@spresense-blocks/codegen-core";

const ORDER_ATOMIC = 0;

/**
 * BMI160(加速度センサー)の読み取りヘルパー関数の名前。
 * BMI160.readAccelerometer() は X/Y/Z を一度に返す(参照渡し)ため、
 * 「X軸の値」のような単一の値を返すブロックからそのまま呼べない。
 * そこで一度だけ読み取ってから軸を選んで返す、小さなヘルパー関数を生成コード側に用意する。
 */
const ACCEL_HELPER_NAME = "spresenseReadAccelG";

/**
 * sensor-addon パック(SPRESENSE用センサー拡張ボード, BMI160+BMP280)のブロック用
 * コード生成関数を、渡された Blockly.Generator に登録する。
 *
 * `generator` はアプリ全体で1つだけ作られる共有インスタンスを想定している
 * (core-io など他のブロックパックのブロックと同じワークスペースに混在するため)。
 * このパックはここで自分の `forBlock` を登録するだけで、
 * `Blockly.Generator` 自体の生成や `scrub_` の設定は呼び出し側(アプリ)の責任にする。
 */
export function registerGenerators(generator: Blockly.Generator, builder: SketchBuilder): void {
  generator.forBlock["spresense_sensor_accel"] = (block: Blockly.Block): [string, number] => {
    builder.addInclude("<BMI160Gen.h>");
    builder.addSetup(
      "bmi160-init",
      "BMI160.begin(BMI160GenClass::I2C_MODE, 0x68);\n" +
        "  BMI160.setAccelerometerRange(2);\n" +
        "  BMI160.setAccelerometerRate(50);"
    );
    // ±2G設定時、BMI160の16bit出力は 16384 で割ると G(重力加速度)単位になる
    // (Bosch BMI160データシートの感度: ±2Gレンジで 16384 LSB/G)。
    builder.addFunction(
      ACCEL_HELPER_NAME,
      `float ${ACCEL_HELPER_NAME}(int axis) {\n` +
        "  int x, y, z;\n" +
        "  BMI160.readAccelerometer(x, y, z);\n" +
        "  int raw = (axis == 0) ? x : (axis == 1) ? y : z;\n" +
        "  return raw / 16384.0;\n" +
        "}"
    );
    const axis = block.getFieldValue("AXIS") as string;
    return [`${ACCEL_HELPER_NAME}(${axis})`, ORDER_ATOMIC];
  };

  generator.forBlock["spresense_sensor_pressure"] = (): [string, number] => {
    builder.addInclude("<Wire.h>");
    builder.addInclude("<Adafruit_BMP280.h>");
    builder.addGlobal("bmp280-instance", "Adafruit_BMP280 spresenseBmp280;");
    builder.addSetup("bmp280-init", "spresenseBmp280.begin();");
    // readPressure() は Pa を返すので、hPa(ヘクトパスカル)に変換する。
    return ["(spresenseBmp280.readPressure() / 100.0)", ORDER_ATOMIC];
  };

  generator.forBlock["spresense_sensor_temperature"] = (): [string, number] => {
    builder.addInclude("<Wire.h>");
    builder.addInclude("<Adafruit_BMP280.h>");
    builder.addGlobal("bmp280-instance", "Adafruit_BMP280 spresenseBmp280;");
    builder.addSetup("bmp280-init", "spresenseBmp280.begin();");
    return ["spresenseBmp280.readTemperature()", ORDER_ATOMIC];
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
