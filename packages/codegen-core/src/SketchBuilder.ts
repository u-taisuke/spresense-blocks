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
/** 「待つ間も続ける処理」をまとめた関数の名前。loop()の先頭と spresenseWait() の中から呼ばれる。 */
export const BACKGROUND_UPDATE_FUNCTION = "spresenseBackgroundUpdate";
/** 「待つ間も続ける処理」を動かしながら待つ関数の名前。delay() の代わりに使う。 */
export const COOPERATIVE_WAIT_FUNCTION = "spresenseWait";

export class SketchBuilder {
  private readonly includes = new Set<string>();
  private readonly globals = new Map<string, string>();
  private readonly setupLines = new Map<string, string>();
  private readonly loopLines: string[] = [];
  private readonly functions = new Map<string, string>();
  private readonly backgroundTasks = new Map<string, string>();
  private cooperativeWait = false;

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

  /**
   * 「待つ間も続ける処理」を登録する。同じ key で複数回呼んでも1回しか出力しない。
   *
   * 例: ゆる楽器(ssprocLib)は、SDカードから音のデータを読み足す `update()` を数ミリ秒おきに
   * 呼び続けないと音が途切れる。こうした処理をここに登録すると、`spresenseBackgroundUpdate()`
   * という関数にまとめられ、「待つ」ブロックが `delay()` ではなく、この処理を動かしながら待つ
   * `spresenseWait()` を使うようになる(`setCooperativeWait` 参照)。
   */
  addBackgroundTask(key: string, code: string): void {
    this.backgroundTasks.set(key, code);
  }

  /** 「待つ間も続ける処理」が1つでも登録されているか。 */
  hasBackgroundTasks(): boolean {
    return this.backgroundTasks.size > 0;
  }

  /**
   * 「待つ」ブロックが、`delay()` の代わりに `spresenseWait()` を使うかどうかを設定する。
   *
   * ワークスペースのどこかに「待つ間も続ける処理」を登録するブロックがあるかどうかは、
   * 全ブロックを一度走査し終わるまでわからない(「待つ」ブロックの方が先に生成されることもある)。
   * そのため、呼び出し側はいったん走査して `hasBackgroundTasks()` を確かめ、`reset()` の後に
   * この値を設定してから、もう一度走査する(2回走査する)。`reset()` するとfalseに戻る。
   */
  setCooperativeWait(enabled: boolean): void {
    this.cooperativeWait = enabled;
  }

  /** 「待つ」ブロック用の1行。`setCooperativeWait(true)` のときだけ `spresenseWait()` になる。 */
  waitStatement(ms: number): string {
    return this.cooperativeWait ? `${COOPERATIVE_WAIT_FUNCTION}(${ms});` : `delay(${ms});`;
  }

  /** 次のワークスペース走査に備えて内部状態を空にする。Blockly標準ジェネレータの「前回の残骸が混ざる」問題を避けるため必須。 */
  reset(): void {
    this.includes.clear();
    this.globals.clear();
    this.setupLines.clear();
    this.loopLines.length = 0;
    this.functions.clear();
    this.backgroundTasks.clear();
    this.cooperativeWait = false;
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

    // 関数の前方宣言(プロトタイプ)。関数の定義は loop() の後ろに置くため、宣言が無いと
    // setup()/loop() から呼べない。Arduino IDE/arduino-cli は ctags で自動的に宣言を補うが、
    // その仕組みに頼らなくても正しいC++になるよう、ここで明示的に出力する。
    const functions = [...this.functions.values()];
    if (this.backgroundTasks.size > 0) {
      functions.push(
        `void ${BACKGROUND_UPDATE_FUNCTION}() {\n${indent([...this.backgroundTasks.values()])}\n}`,
        `void ${COOPERATIVE_WAIT_FUNCTION}(unsigned long ms) {\n` +
          "  unsigned long start = millis();\n" +
          "  while (millis() - start < ms) {\n" +
          `    ${BACKGROUND_UPDATE_FUNCTION}();\n` +
          "  }\n" +
          `  ${BACKGROUND_UPDATE_FUNCTION}();\n` +
          "}"
      );
    }
    const prototypes = functions.map(toPrototype).filter((line): line is string => line !== null);
    if (prototypes.length > 0) {
      sections.push(prototypes.join("\n"));
      sections.push("");
    }

    sections.push("void setup() {");
    sections.push(indent([...this.setupLines.values()]));
    sections.push("}");
    sections.push("");

    sections.push("void loop() {");
    sections.push(indent(this.loopLines));
    sections.push("}");

    if (functions.length > 0) {
      sections.push("");
      sections.push(functions.join("\n\n"));
    }

    return sections.join("\n") + "\n";
  }
}

/** 関数定義の1行目(`{` より前)から、前方宣言の1行を作る。例: "void f(int a) {..." → "void f(int a);" */
function toPrototype(definition: string): string | null {
  const braceIndex = definition.indexOf("{");
  if (braceIndex <= 0) {
    return null;
  }
  const signature = definition.slice(0, braceIndex).trim();
  return signature ? `${signature};` : null;
}

function indent(lines: string[]): string {
  return lines.map((line) => `  ${line}`).join("\n");
}
