import { describe, expect, it } from "vitest";
import { SketchBuilder } from "../src/SketchBuilder.js";

describe("SketchBuilder", () => {
  it("builds a minimal blink-style sketch", () => {
    const builder = new SketchBuilder();
    builder.addInclude("<Arduino.h>");
    builder.addSetup("pinMode:LED0", "pinMode(LED0, OUTPUT);");
    builder.addLoop("digitalWrite(LED0, HIGH);");
    builder.addLoop("delay(500);");
    builder.addLoop("digitalWrite(LED0, LOW);");
    builder.addLoop("delay(500);");

    const code = builder.build();

    expect(code).toContain("#include <Arduino.h>");
    expect(code).toContain("void setup() {\n  pinMode(LED0, OUTPUT);\n}");
    expect(code).toContain(
      "void loop() {\n  digitalWrite(LED0, HIGH);\n  delay(500);\n  digitalWrite(LED0, LOW);\n  delay(500);\n}"
    );
  });

  it("dedupes includes, globals and setup lines by key", () => {
    const builder = new SketchBuilder();
    builder.addInclude("<Arduino.h>");
    builder.addInclude("<Arduino.h>");
    builder.addGlobal("pin:2", "const int PIN_D02 = 2;");
    builder.addGlobal("pin:2", "const int PIN_D02 = 2;");
    builder.addSetup("pinMode:2", "pinMode(PIN_D02, OUTPUT);");
    builder.addSetup("pinMode:2", "pinMode(PIN_D02, OUTPUT);");

    const code = builder.build();

    expect(code.match(/#include <Arduino.h>/g)).toHaveLength(1);
    expect(code.match(/const int PIN_D02 = 2;/g)).toHaveLength(1);
    expect(code.match(/pinMode\(PIN_D02, OUTPUT\);/g)).toHaveLength(1);
  });

  it("keeps loop lines in call order and allows duplicates", () => {
    const builder = new SketchBuilder();
    builder.addLoop("a();");
    builder.addLoop("a();");
    builder.addLoop("b();");

    const code = builder.build();
    const loopBody = code.split("void loop() {")[1];

    expect(loopBody.indexOf("a();")).toBeLessThan(loopBody.lastIndexOf("a();"));
    expect(loopBody.indexOf("a();")).toBeLessThan(loopBody.indexOf("b();"));
  });

  it("emits functions defined outside setup/loop, deduped by name", () => {
    const builder = new SketchBuilder();
    builder.addFunction("blinkOnce", "void blinkOnce() {\n  digitalWrite(LED0, HIGH);\n}");
    builder.addFunction("blinkOnce", "void blinkOnce() {\n  digitalWrite(LED0, HIGH);\n}");

    const code = builder.build();

    expect(code.match(/void blinkOnce\(\)/g)).toHaveLength(1);
  });

  it("reset() clears all accumulated state", () => {
    const builder = new SketchBuilder();
    builder.addInclude("<Arduino.h>");
    builder.addGlobal("g", "int g;");
    builder.addSetup("s", "pinMode(1, OUTPUT);");
    builder.addLoop("delay(1);");
    builder.addFunction("f", "void f() {}");

    builder.reset();
    const code = builder.build();

    expect(code).not.toContain("#include");
    expect(code).not.toContain("int g;");
    expect(code).not.toContain("pinMode(1, OUTPUT);");
    expect(code).not.toContain("delay(1);");
    expect(code).not.toContain("void f()");
    expect(code).toContain("void setup() {\n\n}");
    expect(code).toContain("void loop() {\n\n}");
  });
});
