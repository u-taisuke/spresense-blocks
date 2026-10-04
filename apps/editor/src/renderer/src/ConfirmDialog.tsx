import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface ConfirmOptions {
  title: string;
  /** 本文。改行(\n)はそのまま改行として表示する。 */
  message: string;
  /** 実行する側のボタンの文字(例: 「書き込む」)。 */
  confirmLabel: string;
  /** やめる側のボタンの文字。省略時は「やめる」。 */
  cancelLabel?: string;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * アプリのデザインに合わせた確認画面を出すためのフック。
 * `confirm(options)` は、「実行する」を押すと true、「やめる」・閉じる・Escキーで false になる Promise を返す。
 * `dialog` を画面のどこかに描画しておくこと。
 */
export function useConfirmDialog(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  dialog: React.JSX.Element | null;
} {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    []
  );

  const close = useCallback(
    (confirmed: boolean) => {
      pending?.resolve(confirmed);
      setPending(null);
    },
    [pending]
  );

  const dialog = pending ? <ConfirmDialog options={pending} onClose={close} /> : null;
  return { confirm, dialog };
}

interface ConfirmDialogProps {
  options: ConfirmOptions;
  onClose: (confirmed: boolean) => void;
}

function ConfirmDialog({ options, onClose }: ConfirmDialogProps): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // うっかりEnterキーで実行してしまわないよう、最初は「やめる」側にフォーカスを置く。
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay confirm-overlay" onClick={() => onClose(false)}>
      <div
        className="modal-card confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-icon is-warning" aria-hidden="true">
            <Icon name="alert" size={20} />
          </span>
          <h2 id="confirm-dialog-title">{options.title}</h2>
        </div>
        <p id="confirm-dialog-message" className="confirm-message">
          {options.message}
        </p>
        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="secondary-button" onClick={() => onClose(false)}>
            {options.cancelLabel ?? "やめる"}
          </button>
          <button type="button" className="primary-button" onClick={() => onClose(true)}>
            {options.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
