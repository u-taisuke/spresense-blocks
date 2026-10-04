import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { Icon } from "./Icon";

/** チュートリアル内の、アプリに同梱していない文書(README等)へのリンクは、GitHub上のページを開く。 */
const REPOSITORY_BLOB_URL = "https://github.com/u-taisuke/spresense-blocks/blob/master/";

interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface TutorialViewProps {
  onClose: () => void;
  onOpenSample: (file: string) => void;
}

/**
 * チュートリアル(docs/tutorial.md)をアプリの中で読む画面。左に目次、右に本文を表示する。
 *
 * Markdownは marked でHTMLに変換して表示する。本文はアプリに同梱した自前の文書だけで、
 * ユーザーの入力やネットワーク上の内容は含まないため、変換結果をそのまま描画している
 * (CodeView の highlight.js と同じ考え方。CSPでスクリプトの実行もできない)。
 *
 * 本文中のリンクは次のように扱う:
 * - `samples/〜.sprsb` へのリンク → そのサンプルをアプリで開く
 * - `#見出し` → 同じページ内の見出しへ移動
 * - http(s) → 既定のブラウザで開く
 * - それ以外の相対リンク(README.md 等) → GitHub上の同じファイルを既定のブラウザで開く
 */
export function TutorialView({ onClose, onOpenSample }: TutorialViewProps): React.JSX.Element {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.spresense
      .readTutorial()
      .then(setMarkdown)
      .catch((e: unknown) => setError(`チュートリアルを読み込めませんでした: ${String(e)}`));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const html = useMemo(() => (markdown ? (marked.parse(markdown, { async: false }) as string) : ""), [markdown]);

  // 描画後に見出しへidを振り、目次を作る。
  useLayoutEffect(() => {
    const container = contentRef.current;
    if (!container) {
      return;
    }
    const entries: TocEntry[] = [];
    container.querySelectorAll<HTMLHeadingElement>("h2, h3").forEach((heading, index) => {
      heading.id = `tutorial-section-${index}`;
      entries.push({
        id: heading.id,
        text: heading.textContent ?? "",
        level: heading.tagName === "H2" ? 2 : 3,
      });
    });
    setToc(entries);
  }, [html]);

  const scrollToHeading = (id: string): void => {
    contentRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleContentClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (!anchor || !href) {
      return;
    }
    event.preventDefault();

    const sampleMatch = href.match(/(?:^|\/)samples\/([^/]+\.sprsb)$/);
    if (sampleMatch) {
      onOpenSample(decodeURIComponent(sampleMatch[1]));
      return;
    }
    if (href.startsWith("#")) {
      // Markdownの見出しアンカー(#見出し文字列)は、目次と同じ見出しを本文の文字で探して移動する。
      const target = decodeURIComponent(href.slice(1));
      const entry = toc.find((e) => e.text === target);
      if (entry) {
        scrollToHeading(entry.id);
      }
      return;
    }
    if (/^https?:\/\//.test(href)) {
      window.spresense.openExternal(href);
      return;
    }
    // docs/tutorial.md からの相対パス(例: ../README.md, ./architecture.md)をリポジトリ内のパスに直す。
    const resolved = new URL(href, "https://example.invalid/docs/").pathname.replace(/^\//, "");
    window.spresense.openExternal(`${REPOSITORY_BLOB_URL}${resolved}`);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card tutorial-view"
        role="dialog"
        aria-modal="true"
        aria-label="チュートリアル"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header tutorial-header">
          <span className="modal-icon is-learn" aria-hidden="true">
            <Icon name="book" size={20} />
          </span>
          <h2>チュートリアル</h2>
          <button type="button" className="modal-close" onClick={onClose} title="閉じる">
            <Icon name="close" />
          </button>
        </div>
        <div className="tutorial-layout">
          <nav className="tutorial-toc" aria-label="目次">
            <p className="tutorial-toc-title">目次</p>
            {toc.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`tutorial-toc-item is-level-${entry.level}`}
                onClick={() => scrollToHeading(entry.id)}
              >
                {entry.text}
              </button>
            ))}
          </nav>
          <div className="tutorial-content">
            {error && <p className="modal-status">{error}</p>}
            {!markdown && !error && <p className="modal-status">読み込んでいます…</p>}
            <div
              ref={contentRef}
              className="markdown-body"
              onClick={handleContentClick}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
