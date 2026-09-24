export interface SetupScreenProps {
  message: string;
  error: string | null;
  onRetry: () => void;
}

/**
 * 初回起動時、arduino-cli本体のダウンロードとSPRESENSEコアのインストールが終わるまで表示する画面。
 * 一度セットアップが終われば、次回からはネットワークにアクセスせず一瞬で通過する。
 */
export function SetupScreen({ message, error, onRetry }: SetupScreenProps): React.JSX.Element {
  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1>Spresense Blocks を準備しています</h1>
        <p className="setup-note">
          はじめて起動したときだけ、プログラムを書き込むための道具(arduino-cli と
          SPRESENSEのボード情報)をダウンロードします。数分かかることがあります。
        </p>

        {!error && (
          <>
            <div className="setup-spinner" aria-hidden="true" />
            <p className="setup-message">{message}</p>
          </>
        )}

        {error && (
          <div className="setup-error">
            <p className="setup-message">準備に失敗しました。</p>
            <pre className="setup-error-detail">{error}</pre>
            <p className="setup-note">
              学校のネットワークがプロキシやファイアウォールで外部通信をブロックしている可能性があります。
              ネットワーク環境をご確認のうえ、もう一度お試しください。
            </p>
            <button type="button" className="primary" onClick={onRetry}>
              もう一度試す
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
