import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { SketchBuilder } from "@spresense-blocks/codegen-core";
import { installBlocks, installMessages } from "../src/blocks.js";
import { registerGenerators } from "../src/generators.js";

/**
 * sensor-addon のブロックはすべて値ブロック(output付き)で、それ単体では
 * ワークスペースの最上位に置いても loop() の中身には反映されない
 * (他パックの制御ブロックの値入力に挿し込まれて初めて使われる)。
 * そのため forBlock 関数を直接呼び出して、返ってくる式と SketchBuilder への
 * 副作用(include/global/setup/function)の両方を検証する。
 */
function createGeneratorAndBuilder(): { generator: Blockly.Generator; builder: SketchBuilder } {
  const generator = new Blockly.Generator("Arduino");
  generator.INDENT = "  ";
  const builder = new SketchBuilder();
  registerGenerators(generator, builder);
  return { generator, builder };
}

describe("sensor-addon generators", () => {
  beforeAll(() => {
    installMessages();
    installBlocks();
  });

  it("accelerometer block reads BMI160 and converts raw counts to G", () => {
    const workspace = new Blockly.Workspace();
    const { generator, builder } = createGeneratorAndBuilder();
    const block = workspace.newBlock("spresense_sensor_accel");
    block.setFieldValue("1", "AXIS"); // Y軸

    const [code, order] = generator.forBlock["spresense_sensor_accel"](block, generator) as [string, number];

    expect(code).toBe("spresenseReadAccelG(1)");
    expect(order).toBe(0);

    const sketch = builder.build();
    expect(sketch).toContain("#include <BMI160Gen.h>");
    expect(sketch).toContain("BMI160.begin(BMI160GenClass::I2C_MODE, 0x68);");
    expect(sketch).toContain("BMI160.setAccelerometerRange(2);");
    expect(sketch).toContain("float spresenseReadAccelG(int axis) {");
    expect(sketch).toContain("raw / 16384.0;");
  });

  it("pressure and temperature blocks share one Adafruit_BMP280 instance", () => {
    const workspace = new Blockly.Workspace();
    const { generator, builder } = createGeneratorAndBuilder();
    const pressureBlock = workspace.newBlock("spresense_sensor_pressure");
    const temperatureBlock = workspace.newBlock("spresense_sensor_temperature");

    const [pressureCode] = generator.forBlock["spresense_sensor_pressure"](pressureBlock, generator) as [
      string,
      number,
    ];
    const [temperatureCode] = generator.forBlock["spresense_sensor_temperature"](temperatureBlock, generator) as [
      string,
      number,
    ];

    expect(pressureCode).toBe("(spresenseBmp280.readPressure() / 100.0)");
    expect(temperatureCode).toBe("spresenseBmp280.readTemperature()");

    const sketch = builder.build();
    expect(sketch).toContain("#include <Adafruit_BMP280.h>");
    // グローバルインスタンスは1回しか出力されない(同じdedupキーを使っているため)。
    expect(sketch.match(/Adafruit_BMP280 spresenseBmp280;/g)).toHaveLength(1);
    expect(sketch.match(/spresenseBmp280\.begin\(\);/g)).toHaveLength(1);
  });
});
