/**
 * Electron の `session.resolveProxy()` が返す PAC 形式の文字列
 * (例: `"DIRECT"`, `"PROXY proxy.example.ac.jp:8080; DIRECT"`)から、
 * arduino-cli の `network.proxy` に渡せるプロキシURLを取り出す。
 * プロキシを使わない(DIRECT)場合は null。
 *
 * 複数書かれている場合は先頭から順に見て、最初に見つかったプロキシを使う
 * (arduino-cli には1つしか渡せないため、2つ目以降へのフォールバックはできない)。
 */
export function proxyUrlFromPacResult(pac: string): string | null {
  for (const entry of pac.split(";")) {
    const [rawType, hostPort] = entry.trim().split(/\s+/, 2);
    if (!rawType || !hostPort) {
      continue;
    }
    switch (rawType.toUpperCase()) {
      case "PROXY":
        return `http://${hostPort}`;
      case "HTTPS":
        return `https://${hostPort}`;
      case "SOCKS":
      case "SOCKS5":
        return `socks5://${hostPort}`;
      default:
        // DIRECT やこのアプリが扱えない種類(SOCKS4 等)は飛ばす
        continue;
    }
  }
  return null;
}
