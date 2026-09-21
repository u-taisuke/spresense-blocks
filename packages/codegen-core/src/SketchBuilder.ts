/**
 * Blockly に一切依存しない、Arduino スケッチ(.ino)の組み立て役。
 *
 * ブロックの生成関数は Blockly のワークスペース走査中にこのクラスへ
 * include/グローバル変数/setup 行/loop 行/関数を書き込んでいき、
 * 最後に build() で 1 つの .ino ソースへ合成する。
 *
 * Blockly から独立させているのは、
 *   - codegen 単体を Node のテストだけで検証できるようにするため
 *   - 将来「生成コードを見る」パネルを追加するとき、build() の出力を
 *     そのまま表示するだけで済むようにするため
 * の 2 点。
 */
export class SketchBuilder {
  private readonly includes = new Set<string>();
  private readonly globals = new Map<string, string>();
  private readonly setupLines = new Map<string, string>();
  private readonly loopLines: string[] = [];
  private readonly functions = new Map<string, string>();

  /** 重複しても1回しか出力されない #include を追加する。例: addInclude("<Arduino.h>") */
  addInclude(header: string): void {
    this.includes.add(header);
  }

  /**
   * グローバル宣言を追加する。同じ key で複数回呼んでも1回しか出力しない。
   * 例: addGlobal("pin:D02", "const int PIN_D02 = 2;")
   */
  addGlobal(key: string, declaration: string): void {
    this.globals.set(key, declaration);
  }

  /**
   * setup() の中身を1行追加する。同じ key で複数回呼んでも1回しか出力しない。
   * 例: 同じピンに対して pinMode を2つのブロックが要求しても setup 側は1行に潰れる。
   */
  addSetup(key: string, line: string): void {
    this.setupLines.set(key, line);
  }

  /** loop() の中身を1行(以上)追加する。呼ばれた順番のまま出力される。 */
  addLoop(line: string): void {
    this.loopLines.push(line);
  }

  /** setup()/loop() の外側に置く関数定義を追加する。同名なら1回しか出力しない。 */
  addFunction(name: string, code: string): void {
    this.functions.set(name, code);
  }

  /** 次のワークスペース走査に備えて内部状態を空にする。Blockly標準ジェネレータの「前回の残骸が混ざる」問題を避けるため必須。 */
  reset(): void {
    this.includes.clear();
    this.globals.clear();
    this.setupLines.clear();
    this.loopLines.length = 0;
    this.functions.clear();
  }

  /** これまでに蓄積した内容から、最終的な .ino ソース文字列を組み立てる。 */
  build(): string {
    const sections: string[] = [];

    sections.push("// このファイルは Spresense Blocks によって自動生成されました。");
    sections.push("// 手動で編集しないでください。");
    sections.push("");

    const includes = [...this.includes];
    if (includes.length > 0) {
      sections.push(includes.map((header) => `#include ${header}`).join("\n"));
      sections.push("");
    }

    const globals = [...this.globals.values()];
    if (globals.length > 0) {
      sections.push(globals.join("\n"));
      sections.push("");
    }

    sections.push("void setup() {");
    sections.push(indent([...this.setupLines.values()]));
    sections.push("}");
    sections.push("");

    sections.push("void loop() {");
    sections.push(indent(this.loopLines));
    sections.push("}");

    const functions = [...this.functions.values()];
    if (functions.length > 0) {
      sections.push("");
      sections.push(functions.join("\n\n"));
    }

    return sections.join("\n") + "\n";
  }
}

function indent(lines: string[]): string {
  return lines.map((line) => `  ${line}`).join("\n");
}
