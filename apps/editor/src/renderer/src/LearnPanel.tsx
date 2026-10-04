import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";

/** preload の SampleInfo と同じ形(SdCardPanel の RemovableDrive と同じ理由で、ここに形だけ複製している)。 */
export interface SampleInfo {
  file: string;
  title: string;
  description: string;
  hardware: string;
  category: "基本" | "センサー" | "ゆる楽器";
}

type CategoryFilter = "すべて" | SampleInfo["category"];

const CATEGORY_FILTERS: CategoryFilter[] = ["すべて", "基本", "センサー", "ゆる楽器"];

/** タグの色分け用のクラス名(app.css の .sample-tag.is-*)。 */
const CATEGORY_CLASS: Record<SampleInfo["category"], string> = {
  基本: "is-basic",
  センサー: "is-sensor",
  ゆる楽器: "is-instrument",
};

export interface LearnPanelProps {
  onClose: () => void;
  onOpenTutorial: () => void;
  onOpenSample: (file: string) => void;
}

/**
 * 「サンプル・使い方」画面。チュートリアルへの入口と、同梱サンプルの一覧(必要な機材つき)を表示する。
 * サンプルの一覧は samples/samples.json(メインプロセス経由)から読み込む。
 */
export function LearnPanel({ onClose, onOpenTutorial, onOpenSample }: LearnPanelProps): React.JSX.Element {
  const [samples, setSamples] = useState<SampleInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CategoryFilter>("すべて");

  useEffect(() => {
    window.spresense
      .listSamples()
      .then(setSamples)
      .catch((e: unknown) => setError(`サンプルの一覧を読み込めませんでした: ${String(e)}`));
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

  const visibleSamples = useMemo(
    () => (samples ?? []).filter((sample) => filter === "すべて" || sample.category === filter),
    [samples, filter]
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card learn-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="learn-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-icon is-learn" aria-hidden="true">
            <Icon name="book" size={20} />
          </span>
          <h2 id="learn-panel-title">サンプル・使い方</h2>
          <button type="button" className="modal-close" onClick={onClose} title="閉じる">
            <Icon name="close" />
          </button>
        </div>

        <button type="button" className="tutorial-card" onClick={onOpenTutorial}>
          <span className="tutorial-card-icon" aria-hidden="true">
            <Icon name="book" size={22} />
          </span>
          <span className="tutorial-card-text">
            <strong>チュートリアルを読む</strong>
            <span>画面の見方、最初のプログラム(Lチカ)の作り方、サンプルの使い方などを説明しています。</span>
          </span>
          <Icon name="arrowRight" />
        </button>

        <div className="learn-section-header">
          <h3>サンプル</h3>
          <div className="filter-chips" role="tablist" aria-label="サンプルの種類">
            {CATEGORY_FILTERS.map((category) => (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={filter === category}
                className={`filter-chip${filter === category ? " is-active" : ""}`}
                onClick={() => setFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
        <p className="modal-note">
          番号順に、少しずつ新しいブロックが出てきます。「開く」を押すと、今のプログラムの代わりに読み込まれます。
        </p>

        {error && <p className="modal-status">{error}</p>}
        {!samples && !error && <p className="modal-status">読み込んでいます…</p>}

        <ul className="sample-list">
          {visibleSamples.map((sample) => {
            const number = sample.file.match(/^(\d+)_/)?.[1] ?? "";
            return (
              <li key={sample.file} className="sample-card">
                <span className="sample-number">{number}</span>
                <div className="sample-body">
                  <div className="sample-title-row">
                    <strong className="sample-title">{sample.title}</strong>
                    <span className={`sample-tag ${CATEGORY_CLASS[sample.category]}`}>{sample.category}</span>
                  </div>
                  <p className="sample-description">{sample.description}</p>
                  <p className="sample-hardware">
                    <Icon name="tool" size={14} />
                    <span>{sample.hardware}</span>
                  </p>
                </div>
                <button type="button" className="secondary-button sample-open" onClick={() => onOpenSample(sample.file)}>
                  開く
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
