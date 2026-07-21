import { describe, expect, it } from "vitest";
import { extractMeetingUrls, hostMatches, isMeetingUrl, stripTrailingPunctuation } from "../../src/core/extract-meeting-urls";

describe("hostMatches：サブドメイン偽装・類似ホスト名を排除する", () => {
  it("完全一致・正しいサブドメインを許可する", () => {
    expect(hostMatches("zoom.us", "zoom.us")).toBe(true);
    expect(hostMatches("us02web.zoom.us", "zoom.us")).toBe(true);
  });

  it("類似ホスト名・サフィックス偽装を排除する", () => {
    expect(hostMatches("evilzoom.us", "zoom.us")).toBe(false);
    expect(hostMatches("notzoom.us", "zoom.us")).toBe(false);
    expect(hostMatches("zoom.us.evil.example", "zoom.us")).toBe(false);
  });
});

describe("stripTrailingPunctuation：複合末尾記号の除去", () => {
  it("単一の閉じ括弧・句点を除去する", () => {
    expect(stripTrailingPunctuation("https://zoom.us/j/123456789)")).toBe("https://zoom.us/j/123456789");
    expect(stripTrailingPunctuation("https://zoom.us/j/123456789。")).toBe("https://zoom.us/j/123456789");
  });

  it("複合末尾記号（閉じ括弧＋句点）を1回で除去する", () => {
    expect(stripTrailingPunctuation("https://meet.google.com/abc-defg-hij).")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
  });

  it("末尾に記号が無ければ変更しない", () => {
    expect(stripTrailingPunctuation("https://zoom.us/j/123456789")).toBe("https://zoom.us/j/123456789");
  });

  it("英数字で終わるクエリは変更しない", () => {
    expect(stripTrailingPunctuation("https://zoom.us/j/123456789?pwd=abc123")).toBe(
      "https://zoom.us/j/123456789?pwd=abc123",
    );
  });
});

describe("isMeetingUrl：サービス別判定", () => {
  it("Zoomの標準形式・サブドメイン形式を受理する", () => {
    expect(isMeetingUrl(new URL("https://zoom.us/j/123456789"))).toBe(true);
    expect(isMeetingUrl(new URL("https://us02web.zoom.us/j/12345678901?pwd=abc"))).toBe(true);
  });

  it("Zoomの桁数不正・別パスは拒否する", () => {
    expect(isMeetingUrl(new URL("https://zoom.us/j/12345"))).toBe(false);
    expect(isMeetingUrl(new URL("https://zoom.us/profile"))).toBe(false);
    expect(isMeetingUrl(new URL("https://zoom.us/w/123456789"))).toBe(false);
  });

  it("Google Meetの標準形式を受理する", () => {
    expect(isMeetingUrl(new URL("https://meet.google.com/abc-defg-hij"))).toBe(true);
  });

  it("Google Meetのトップページ・不正な文字数は拒否する", () => {
    expect(isMeetingUrl(new URL("https://meet.google.com/"))).toBe(false);
    expect(isMeetingUrl(new URL("https://meet.google.com/ab-defg-hij"))).toBe(false);
  });

  it("Teams従来形式を受理する", () => {
    expect(
      isMeetingUrl(
        new URL(
          "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7B%22Tid%22%3A%221%22%7D",
        ),
      ),
    ).toBe(true);
  });

  it("Teamsのチャット・チャンネルURLは拒否する", () => {
    expect(isMeetingUrl(new URL("https://teams.microsoft.com/l/chat/0/0"))).toBe(false);
    expect(isMeetingUrl(new URL("https://teams.microsoft.com/l/channel/19/general"))).toBe(false);
  });

  it("会議識別子として成立しない任意文字列は拒否する（Stage5実装レビューで発見：過度に広い正規表現の修正）", () => {
    expect(isMeetingUrl(new URL("https://teams.microsoft.com/l/meetup-join/profile/123"))).toBe(false);
    expect(isMeetingUrl(new URL("https://teams.microsoft.com/l/meetup-join/not-a-meeting/999"))).toBe(false);
  });

  it("実際のTeams会議識別子形式（19%3ameeting_...%40thread.v2）は受理する", () => {
    expect(
      isMeetingUrl(new URL("https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0")),
    ).toBe(true);
  });

  it("Teams新短縮形式を受理する", () => {
    expect(isMeetingUrl(new URL("https://teams.microsoft.com/meet/1234567890?p=abcDEF123"))).toBe(true);
  });

  it("Teams個人版（teams.live.com）を受理する", () => {
    expect(isMeetingUrl(new URL("https://teams.live.com/meet/9425716001426"))).toBe(true);
    expect(isMeetingUrl(new URL("https://teams.live.com/meet/9453665062469?p=7KmyvbZxo5iKiQWL"))).toBe(true);
  });

  it("http（非https）は受理しない", () => {
    expect(isMeetingUrl(new URL("http://zoom.us/j/123456789"))).toBe(false);
  });
});

describe("extractMeetingUrls：抽出・重複排除・順序", () => {
  it("複数ソースからサービス別URLを抽出し出現順を維持する", () => {
    const sources = [
      "会議はこちら https://zoom.us/j/123456789 です",
      "Meetはこちら: https://meet.google.com/abc-defg-hij",
    ];
    expect(extractMeetingUrls(sources)).toEqual([
      "https://zoom.us/j/123456789",
      "https://meet.google.com/abc-defg-hij",
    ]);
  });

  it("アンカーテキストに現れないhrefのみのURLも抽出する", () => {
    const sources = ["Zoomに参加", "https://zoom.us/j/123456789"];
    expect(extractMeetingUrls(sources)).toEqual(["https://zoom.us/j/123456789"]);
  });

  it("同一URLがテキストとhrefの両方にあっても1件だけ抽出する", () => {
    const sources = ["https://zoom.us/j/123456789", "https://zoom.us/j/123456789"];
    expect(extractMeetingUrls(sources)).toHaveLength(1);
  });

  it("fragmentだけが異なるURLは同一会議として扱い最初のURLを残す", () => {
    const sources = [
      "https://meet.google.com/abc-defg-hij#first",
      "https://meet.google.com/abc-defg-hij#second",
    ];
    expect(extractMeetingUrls(sources)).toEqual(["https://meet.google.com/abc-defg-hij#first"]);
  });

  it("会議URLに似ているが無関係なURLは拾わない", () => {
    const sources = [
      "https://zoom.us/profile",
      "https://meet.google.com/",
      "https://teams.microsoft.com/l/chat/0/0",
      "https://notzoom.us/j/123456789",
    ];
    expect(extractMeetingUrls(sources)).toEqual([]);
  });

  it("複合末尾記号（メール本文由来の句読点）を正しく除去して抽出する", () => {
    const sources = ["会議URL（https://meet.google.com/abc-defg-hij）。"];
    expect(extractMeetingUrls(sources)).toEqual(["https://meet.google.com/abc-defg-hij"]);
  });

  it("全角の隅付き括弧・かぎ括弧類も末尾記号として除去する（Stage5実装レビューで発見）", () => {
    expect(extractMeetingUrls(["【会議URL：https://meet.google.com/abc-defg-hij】"])).toEqual([
      "https://meet.google.com/abc-defg-hij",
    ]);
    expect(extractMeetingUrls(["会議URL：https://zoom.us/j/123456789】"])).toEqual([
      "https://zoom.us/j/123456789",
    ]);
  });

  it("閉じ括弧の直後にスペース無しで地の文が続いても正しく抽出する（監査で発見：以前は無言で抽出漏れになっていた）", () => {
    expect(
      extractMeetingUrls(["会議URLは【https://meet.google.com/abc-defg-hij】をご確認ください"]),
    ).toEqual(["https://meet.google.com/abc-defg-hij"]);
    expect(extractMeetingUrls(["【https://zoom.us/j/123456789】に接続してください"])).toEqual([
      "https://zoom.us/j/123456789",
    ]);
  });

  it("Teamsのthread.v2に含まれる\".\"が誤った切り詰め位置にならず、地の文の直後まで正しく抽出する", () => {
    const url = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/1234567890";
    expect(extractMeetingUrls([`【${url}】に参加してください`])).toEqual([url]);
  });

  it("Teamsの長いcontextクエリを壊さずに抽出する", () => {
    const url =
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7B%22Tid%22%3A%221%22%2C%22Oid%22%3A%222%22%7D";
    const sources = [`参加はこちら: ${url}`];
    expect(extractMeetingUrls(sources)).toEqual([url]);
  });

  it("該当URLが無ければ空配列を返す", () => {
    expect(extractMeetingUrls(["こんにちは、明日よろしくお願いします。"])).toEqual([]);
  });
});
