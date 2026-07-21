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
      const stripped = stripTrailingPunctuation(raw);
      let url: URL;
      try {
        url = new URL(stripped);
      } catch {
        continue;
      }
      if (!isMeetingUrl(url)) continue;

      const key = dedupeKeyOf(url);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(stripped);
    }
  }

  return result;
}
