import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import * as Blockly from "blockly/core";
import { SketchBuilder } from "@spresense-blocks/codegen-core";
import { installBlocks as installCoreIoBlocks, installMessages as installCoreIoMessages } from "@spresense-blocks/block-pack-core-io";
import {
  installBlocks as installSensorAddonBlocks,
  installMessages as installSensorAddonMessages,
} from "@spresense-blocks/block-pack-sensor-addon";
import {
  installBlocks as installInstrumentBlocks,
  installMessages as installInstrumentMessages,
} from "@spresense-blocks/block-pack-instrument";
import { generateSketch } from "../src/renderer/src/codegen";

/**
 * CIで実際に `arduino-cli compile` を通すための、代表的なブロック構成のサンプル。
 * アプリ本体と同じ `codegen.ts`(全パック共有の Blockly.Generator を合成する場所)を
 * 通してコード生成するため、「ユニットテストでは通るが、実際のアプリの合成経路では
 * 壊れている」という種類の回帰を検知できる。
 *
 * ここで生成した .ino は `ci-samples/<name>/<name>.ino` に書き出す
 * (Arduinoのビルドシステムが要求する「フォルダ名 == .inoファイル名」規約に合わせている)。
 * `ci-samples/` はコミットしない(.gitignore参照)。CIのワークフローが毎回このテストを
 * 実行してから `arduino-cli compile` をかける。
 *
 * 新しいブロックパックを追加したら、ここにもサンプルを1つ足すこと。
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_DIR = join(REPO_ROOT, "ci-samples");

const SAMPLES: Record<string, unknown> = {
  "basic-io": {
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
                            type: "spresense_digital_write",
                            id: "dw1",
                            fields: { PIN: "PIN_D02", STATE: "HIGH" },
                            next: {
                              block: {
                                type: "spresense_pwm_write",
                                id: "pwm1",
                                fields: { PIN: "PIN_D05" },
                                inputs: {
                                  VALUE: { block: { type: "spresense_analog_read", id: "ar1", fields: { PIN: "A0" } } },
                                },
                                next: {
                                  block: {
                                    type: "spresense_if",
                                    id: "if1",
                                    inputs: {
                                      CONDITION: {
                                        block: { type: "spresense_digital_read", id: "dr1", fields: { PIN: "PIN_D03" } },
                                      },
                                      DO: {
                                        block: {
                                          type: "spresense_repeat_times",
                                          id: "repeat1",
                                          fields: { TIMES: 3 },
                                          inputs: {
                                            DO: {
                                              block: {
                                                type: "spresense_variable_set",
                                                id: "varset1",
                                                fields: { NAME: "x" },
                                                inputs: {
                                                  VALUE: {
                                                    block: { type: "spresense_analog_read", id: "ar2", fields: { PIN: "A1" } },
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
          },
        },
      ],
    },
  },
  "sensor-addon": {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: "spresense_forever",
          id: "forever1",
          inputs: {
            DO: {
              block: {
                type: "spresense_variable_set",
                id: "set_accel",
                fields: { NAME: "accel" },
                inputs: {
                  VALUE: { block: { type: "spresense_sensor_accel", id: "accel1", fields: { AXIS: "0" } } },
                },
                next: {
                  block: {
                    type: "spresense_if",
                    id: "if1",
                    inputs: {
                      CONDITION: {
                        block: {
                          type: "spresense_compare",
                          id: "cmp1",
                          fields: { OP: "GT" },
                          inputs: {
                            A: { block: { type: "spresense_variable_get", id: "get_accel", fields: { NAME: "accel" } } },
                            B: { block: { type: "spresense_number", id: "num1", fields: { NUM: 1 } } },
                          },
                        },
                      },
                      DO: {
                        block: {
                          type: "spresense_onboard_led_set",
                          id: "led1",
                          fields: { LED: "LED1", STATE: "HIGH" },
                        },
                      },
                    },
                    next: {
                      block: {
                        type: "spresense_variable_set",
                        id: "set_temp",
                        fields: { NAME: "temp" },
                        inputs: {
                          VALUE: { block: { type: "spresense_sensor_temperature", id: "temp1" } },
                        },
                        next: {
                          block: {
                            type: "spresense_variable_set",
                            id: "set_pressure",
                            fields: { NAME: "pressure" },
                            inputs: {
                              VALUE: { block: { type: "spresense_sensor_pressure", id: "pressure1" } },
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
        },
      ],
    },
  },
  instrument: {
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
                    type: "spresense_if",
                    id: "if1",
                    inputs: {
                      CONDITION: {
                        block: {
                          type: "spresense_digital_read",
                          id: "dr1",
                          fields: { PIN: "PIN_D04" },
                        },
                      },
                      DO: {
                        block: {
                          type: "spresense_instrument_play_note",
                          id: "play1",
                          fields: { NOTE: "60", DURATION_MS: 500, VOLUME: 100 },
                        },
                      },
                    },
                    next: {
                      block: {
                        type: "spresense_if",
                        id: "if2",
                        inputs: {
                          CONDITION: {
                            block: {
                              type: "spresense_digital_read",
                              id: "dr2",
                              fields: { PIN: "PIN_D05" },
                            },
                          },
                          DO: {
                            block: {
                              type: "spresense_instrument_play_note",
                              id: "play2",
                              fields: { NOTE: "62", DURATION_MS: 800, VOLUME: 60 },
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
        },
      ],
    },
  },
};

describe("CI用サンプルプロジェクトの生成", () => {
  beforeAll(() => {
    installCoreIoMessages();
    installCoreIoBlocks();
    installSensorAddonMessages();
    installSensorAddonBlocks();
    installInstrumentMessages();
    installInstrumentBlocks();
  });

  for (const [name, state] of Object.entries(SAMPLES)) {
    it(`generates a compilable-looking sketch for "${name}"`, () => {
      const workspace = new Blockly.Workspace();
      Blockly.serialization.workspaces.load(state as never, workspace);

      const builder = new SketchBuilder();
      const sketch = generateSketch(workspace, builder);

      expect(sketch).toContain("void setup()");
      expect(sketch).toContain("void loop()");

      const sampleDir = join(OUT_DIR, name);
      mkdirSync(sampleDir, { recursive: true });
      writeFileSync(join(sampleDir, `${name}.ino`), sketch);
    });
  }
});
