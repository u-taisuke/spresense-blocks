import { useEffect, useRef, useState } from "react";
import type { DetectedBoard } from "@spresense-blocks/arduino-cli-bridge";

export interface PortSelectProps {
  ports: DetectedBoard[];
  selectedPort: string;
  isRefreshing: boolean;
  disabled?: boolean;
  /** ドロップダウンを開いた瞬間に呼ばれる。ここで最新のポート一覧を取りに行く。 */
  onOpen: () => void;
  onSelect: (port: string) => void;
}

/**
 * USBポート選択UI。
 *
 * ネイティブの <select> は、開いている間にJS側からリストの中身を更新できない
 * (ブラウザ/OSが開いた瞬間の内容をポップアップとして描画するため)。
 * 一方 `arduino-cli board list` の実行には数秒かかることがあるため、
 * 「開いた瞬間に検索して、結果が届き次第その場で更新する」ことはネイティブ<select>では
 * 実現できない。そのため開閉を自前で管理する簡易ドロップダウンにしている。
 */
export function PortSelect({
  ports,
  selectedPort,
  isRefreshing,
  disabled,
  onOpen,
  onSelect,
}: PortSelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleToggle = (): void => {
    if (disabled) {
      return;
    }
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        onOpen();
      }
      return next;
    });
  };

  const selectedBoard = ports.find((p) => p.port === selectedPort);
  const label = selectedBoard
    ? `${selectedBoard.port}${selectedBoard.boardName ? ` - ${selectedBoard.boardName}` : ""}`
    : selectedPort || "(ポート未選択)";

  return (
    <div className="port-select" ref={containerRef}>
      <button
        type="button"
        className="port-select-trigger"
        onClick={handleToggle}
        disabled={disabled}
      >
        <span>{label}</span>
        <span className="port-select-caret">▾</span>
      </button>
      {open && (
        <ul className="port-select-menu">
          {isRefreshing && <li className="port-select-status">さがしています...</li>}
          {!isRefreshing && ports.length === 0 && (
            <li className="port-select-status">USBポートが見つかりません</li>
          )}
          {ports.map((p) => (
            <li key={p.port}>
              <button
                type="button"
                className="port-select-option"
                onClick={() => {
                  onSelect(p.port);
                  setOpen(false);
                }}
              >
                {p.port}
                {p.boardName ? ` - ${p.boardName}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
