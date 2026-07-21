// ホスト名検証のコード契約（Stage2で確定）。"."を前置したendsWithにより、
// evilzoom.us・zoom.us.evil.exampleのようなサブドメイン偽装・類似ホスト名
// を誤って一致させない（A-6のfindMatchingSiteRuleと同じ安全なパターン）。
export function hostMatches(hostname: string, base: string): boolean {
  return hostname === base || hostname.endsWith(`.${base}`);
}

function isZoomUrl(url: URL): boolean {
  return hostMatches(url.hostname, "zoom.us") && /^\/j\/[0-9]{9,11}$/.test(url.pathname);
}

function isMeetUrl(url: URL): boolean {
  return url.hostname === "meet.google.com" && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname);
}

// 会議スレッド識別子の構造（19%3ameeting_<opaque>%40thread.v2）を検証する。
// Stage5実装レビューで、`[^/]+`という緩い受理条件だと
// "/l/meetup-join/profile/123"のような会議識別子として成立しない任意
// 文字列も通ってしまうと指摘されたため、実際の形式に狭めた
// （thread.skype等の旧形式は今回のMVPでは対象外とする）。
function isTeamsClassicUrl(url: URL): boolean {
  return (
    url.hostname === "teams.microsoft.com" &&
    /^\/l\/meetup-join\/19%3ameeting_[^/]+%40thread\.v2\/[0-9]+$/i.test(url.pathname)
  );
}

function isTeamsShortUrl(url: URL): boolean {
  return url.hostname === "teams.microsoft.com" && /^\/meet\/[0-9]{10,20}$/.test(url.pathname);
}

function isTeamsPersonalUrl(url: URL): boolean {
  return url.hostname === "teams.live.com" && /^\/meet\/[0-9]{10,20}$/.test(url.pathname);
}

export function isMeetingUrl(url: URL): boolean {
  // httpsのみ受理する。候補抽出時の正規表現（https://から開始）でも
  // 実質的に排除されるが、この関数を直接呼ぶ場合にも仕様どおり
  // httpを拒否するよう、ここでも明示的に検証する（防御的多重化）。
  if (url.protocol !== "https:") return false;
  return (
    isZoomUrl(url) || isMeetUrl(url) || isTeamsClassicUrl(url) || isTeamsShortUrl(url) || isTeamsPersonalUrl(url)
  );
}

// ASCII・日本語の閉じ括弧/句読点/引用符をまとめた文字クラス。`+$`により
// 該当文字が続く限り末尾から一括で除去する（`).`のような複合末尾記号も
// 1回のreplaceで取りこぼさない）。日本語の全角括弧類（】］｝〉》）や
// 全角引用符（"'）が不足していたため追加した（Stage5実装レビューで発見：
// 「【会議URL：https://...】」のような表記で末尾記号がURLパスの一部として
// 誤解釈され抽出に失敗していた）。
const TRAILING_PUNCTUATION = /[)\]}>.,;:!?'"」』）】］｝〉》”’、。！？]+$/;

export function stripTrailingPunctuation(candidate: string): string {
  return candidate.replace(TRAILING_PUNCTUATION, "");
}

function tryParseMeetingUrl(candidate: string): URL | null {
  try {
    const url = new URL(candidate);
    return isMeetingUrl(url) ? url : null;
  } catch {
    return null;
  }
}

// 候補抽出の正規表現（\S+）は空白文字までを貪欲にマッチするため、閉じ
// 括弧の直後にスペース無しで地の文が続く実際によくある書き方
// （例："【https://meet.google.com/abc-defg-hij】をご確認ください"）では、
// 会議URLの後ろに続く地の文までもが1つの候補として飲み込まれる。地の文は
// TRAILING_PUNCTUATIONの文字クラスに含まれないため、末尾からの除去だけ
// では対応できない（実Chromeスモークテスト監査で発見）。
//
// まず通常どおり末尾の記号除去だけで有効な会議URLになるか試し、失敗した
// 場合は候補内に現れる区切り記号の出現位置ごとに手前で切り詰めて再検証
// する。区切り記号はURLの正当な構成要素（例：Teamsの"thread.v2"の"."）
// にも偶然含まれ得るため、最初に見つかった位置だけで決め打ちせず、
// 実際に有効な会議URLとして検証できる位置が見つかるまで順に試す。
function extractValidMeetingUrl(rawCandidate: string): { text: string; url: URL } | null {
  const stripped = stripTrailingPunctuation(rawCandidate);
  const direct = tryParseMeetingUrl(stripped);
  if (direct) return { text: stripped, url: direct };

  const punctuationPositions = /[)\]}>.,;:!?'"」』）】］｝〉》”’、。！？]/g;
  let match: RegExpExecArray | null;
  while ((match = punctuationPositions.exec(rawCandidate)) !== null) {
    const truncated = rawCandidate.slice(0, match.index);
    const candidate = tryParseMeetingUrl(truncated);
    if (candidate) return { text: truncated, url: candidate };
  }

  return null;
}

const URL_CANDIDATE_PATTERN = /https:\/\/\S+/g;

// 重複排除の比較キー。末尾の単一スラッシュを除去し、fragment（#以降）は
// 比較に含めない（fragmentだけが異なるURLは同一会議として扱い、最初の
// URLを残す）。実際にコピーする文字列は正規化前の元の一致文字列を使う。
function dedupeKeyOf(url: URL): string {
  let pathname = url.pathname;
  if (pathname !== "/" && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  return `${url.origin}${pathname}${url.search}`;
}

// sourcesは選択範囲・ページ全体から収集した生テキスト／href文字列の配列
// （DOM上の出現順）。DOM・Chrome APIには一切依存しない純粋関数のため、
// vitestで直接importしてテーブル駆動テストできる。
export function extractMeetingUrls(sources: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const source of sources) {
    const matches = source.match(URL_CANDIDATE_PATTERN);
    if (!matches) continue;

    for (const raw of matches) {
      const extracted = extractValidMeetingUrl(raw);
      if (!extracted) continue;

      const key = dedupeKeyOf(extracted.url);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(extracted.text);
    }
  }

  return result;
}
