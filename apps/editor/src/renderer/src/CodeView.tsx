import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import cpp from "highlight.js/lib/languages/cpp";
import "highlight.js/styles/atom-one-dark.css";

hljs.registerLanguage("cpp", cpp);

export interface CodeViewProps {
  code: string;
}

/**
 * 生成されたArduinoスケッチ(C++)を読み取り専用・シンタックスハイライト付きで表示するパネル。
 *
 * `code` はブロックから自動生成されたソースであり、ユーザーが自由入力した文字列が
 * そのまま埋め込まれる箇所は無い(変数名は `safeVariableName` で安全な識別子に変換される等)。
 * そのためhighlight.jsの出力(入力を自前でHTMLエスケープしてからハイライト用のタグを足す)を
 * そのまま描画している。
 *
 * オフライン環境(学校のネットワーク)でも動くよう、CDNからではなく highlight.js を
 * アプリにバンドルしている(`blockly-media` を同梱しているのと同じ考え方)。
 */
export function CodeView({ code }: CodeViewProps): React.JSX.Element {
  const highlighted = useMemo(() => hljs.highlight(code, { language: "cpp" }).value, [code]);

  return (
    <pre className="code-view">
      <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  );
}
