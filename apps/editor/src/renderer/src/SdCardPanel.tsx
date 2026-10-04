import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";

export interface SdCardPanelProps {
  onClose: () => void;
}

/** preload の RemovableDrive と同じ形。tsconfig.web.json のプロジェクト範囲外(src/preload/index.ts)を
 * 直接importしないよう、ここでは形だけを複製している(window.spresense の型は src/preload/index.d.ts
 * 経由で別途グローバルに解決される)。 */
interface RemovableDrive {
  driveLetter: string;
  volumeName: string;
  totalBytes: number;
  freeBytes: number;
}

const VOICE_LABELS: Record<string, string> = {
  Piano: "ピアノ",
  Sax: "サックス",
  Organ: "オルガン",
  Glock: "鉄琴",
  Chip: "8ビット",
};

function formatGiB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

/**
 * 「ゆる楽器」ブロックが使う音源WAVを、物理的なSDカード(PC本体やUSBカードリーダーに挿したもの)に
 * コピーするための画面。
 *
 * SPRESENSE本体はUSB接続時にSDカードをドライブとして公開しない(プログラム書き込み用の
 * USB-シリアルポートとしてしか見えない)ため、「コンパイル&書き込み」と全く同じ操作では
 * SDカードにファイルを置けない。そのためユーザーがmicroSDカードを一旦取り外してPCに挿す、
 * という手順を前提にした別画面にしてある。
 */
export function SdCardPanel({ onClose }: SdCardPanelProps): React.JSX.Element {
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);
  const [selectedVoices, setSelectedVoices] = useState<Set<string>>(new Set());
  const [drives, setDrives] = useState<RemovableDrive[]>([]);
  const [selectedDrive, setSelectedDrive] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const scanDrives = useCallback(async () => {
    setIsScanning(true);
    setMessage(null);
    try {
      const found = await window.spresense.listRemovableDrives();
      setDrives(found);
      setSelectedDrive((prev) => (found.some((d) => d.driveLetter === prev) ? prev : (found[0]?.driveLetter ?? "")));
      if (found.length === 0) {
        setMessage("リムーバブルディスクが見つかりません。SDカードをPCに挿してから「探す」を押してください。");
      }
    } catch (error) {
      setMessage(`ドライブの取得に失敗しました: ${String(error)}`);
    } finally {
      setIsScanning(false);
    }
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

  useEffect(() => {
    window.spresense.listAvailableVoices().then((voices) => {
      setAvailableVoices(voices);
      setSelectedVoices(new Set(voices));
    });
    scanDrives();
  }, [scanDrives]);

  const toggleVoice = (voice: string): void => {
    setSelectedVoices((prev) => {
      const next = new Set(prev);
      if (next.has(voice)) {
        next.delete(voice);
      } else {
        next.add(voice);
      }
      return next;
    });
  };

  const handleCopy = async (): Promise<void> => {
    if (!selectedDrive || selectedVoices.size === 0) {
      return;
    }
    setIsCopying(true);
    setMessage(null);
    try {
      const result = await window.spresense.copyVoicesToDrive(selectedDrive, [...selectedVoices]);
      if (result.ok) {
        setMessage(
          `コピーが完了しました: ${selectedDrive} に ${result.copiedVoices.map((v) => VOICE_LABELS[v] ?? v).join("・")}`
        );
      } else {
        setMessage(`コピーに失敗しました: ${result.error}`);
      }
    } catch (error) {
      setMessage(`コピーに失敗しました: ${String(error)}`);
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sd-card-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-icon" aria-hidden="true">
            <Icon name="music" size={20} />
          </span>
          <h2 id="sd-card-panel-title">SDカードに音源をコピー</h2>
          <button type="button" className="modal-close" onClick={onClose} title="閉じる">
            <Icon name="close" />
          </button>
        </div>
        <p className="modal-note">
          「ゆる楽器」ブロックで使う音(ピアノ・サックス・オルガン・鉄琴・8ビット)は、SPRESENSEのmicroSDカードに
          前もってコピーしておく必要があります。SDカードを一度SPRESENSEから取り外し、
          PC本体やUSBカードリーダーに挿してから、下のボタンでコピーしてください。
        </p>

        <section className="modal-section">
          <h3>
            <span className="step-number">1</span>コピーする音色を選ぶ
          </h3>
          {availableVoices.length === 0 && <p className="modal-status">利用できる音色がありません。</p>}
          <div className="voice-options">
          {availableVoices.map((voice) => (
            <label key={voice} className={`voice-option${selectedVoices.has(voice) ? " is-checked" : ""}`}>
              <input
                type="checkbox"
                checked={selectedVoices.has(voice)}
                onChange={() => toggleVoice(voice)}
              />
              {VOICE_LABELS[voice] ?? voice}
            </label>
          ))}
          </div>
        </section>

        <section className="modal-section">
          <h3>
            <span className="step-number">2</span>コピー先のドライブを選ぶ
          </h3>
          <div className="modal-row">
            <select
              value={selectedDrive}
              onChange={(e) => setSelectedDrive(e.target.value)}
              disabled={drives.length === 0}
            >
              {drives.length === 0 && <option value="">(ドライブが見つかりません)</option>}
              {drives.map((d) => (
                <option key={d.driveLetter} value={d.driveLetter}>
                  {d.driveLetter} {d.volumeName ? `(${d.volumeName})` : ""} — 空き{formatGiB(d.freeBytes)}
                </option>
              ))}
            </select>
            <button type="button" className="secondary-button" onClick={scanDrives} disabled={isScanning}>
              <Icon name="refresh" size={16} />
              {isScanning ? "探しています…" : "探す"}
            </button>
          </div>
        </section>

        {message && <p className="modal-status">{message}</p>}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            閉じる
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleCopy}
            disabled={isCopying || !selectedDrive || selectedVoices.size === 0}
          >
            {isCopying ? "コピー中…" : "コピーする"}
          </button>
        </div>
      </div>
    </div>
  );
}
