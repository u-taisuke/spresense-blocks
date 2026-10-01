import { useCallback, useEffect, useState } from "react";

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
        setMessage("リムーバブルディスクが見つかりません。SDカードをPCに挿してから「さがす」を押してください。");
      }
    } catch (error) {
      setMessage(`ドライブの取得に失敗しました: ${String(error)}`);
    } finally {
      setIsScanning(false);
    }
  }, []);

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
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>SDカードに音源をコピー</h2>
        <p className="modal-note">
          「ゆる楽器」ブロックで使う音(ピアノ・サックス)は、SPRESENSEのmicroSDカードに
          あらかじめコピーしておく必要があります。SDカードを一度SPRESENSEから取り外し、
          PC本体やUSBカードリーダーに挿してから、下のボタンでコピーしてください。
        </p>

        <section className="modal-section">
          <h3>1. コピーする音色を選ぶ</h3>
          {availableVoices.length === 0 && <p className="modal-status">利用できる音色がありません。</p>}
          {availableVoices.map((voice) => (
            <label key={voice} className="modal-checkbox">
              <input
                type="checkbox"
                checked={selectedVoices.has(voice)}
                onChange={() => toggleVoice(voice)}
              />
              {VOICE_LABELS[voice] ?? voice}
            </label>
          ))}
        </section>

        <section className="modal-section">
          <h3>2. コピー先のドライブを選ぶ</h3>
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
            <button type="button" onClick={scanDrives} disabled={isScanning}>
              {isScanning ? "さがしています..." : "さがす"}
            </button>
          </div>
        </section>

        {message && <p className="modal-status">{message}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            閉じる
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleCopy}
            disabled={isCopying || !selectedDrive || selectedVoices.size === 0}
          >
            {isCopying ? "コピー中..." : "コピーする"}
          </button>
        </div>
      </div>
    </div>
  );
}
