import { afterEach, describe, expect, it } from "vitest";
import { collectCandidates } from "../../src/inject/collect-candidates";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("collectCandidates：ページ全体モード", () => {
  it("テキストとa[href]の両方をDOM出現順で収集する", () => {
    document.body.innerHTML = `
      <p>会議はこちら https://zoom.us/j/123456789 です</p>
      <a href="https://meet.google.com/abc-defg-hij">Meetに参加</a>
    `;

    const result = collectCandidates("page");

    expect(result.some((s) => s.includes("https://zoom.us/j/123456789"))).toBe(true);
    expect(result).toContain("https://meet.google.com/abc-defg-hij");
    const textIndex = result.findIndex((s) => s.includes("zoom.us"));
    const hrefIndex = result.indexOf("https://meet.google.com/abc-defg-hij");
    expect(textIndex).toBeLessThan(hrefIndex);
  });

  it("表示テキストにURLが無くてもhrefから収集する", () => {
    document.body.innerHTML = `<a href="https://zoom.us/j/123456789">Zoomに参加</a>`;

    const result = collectCandidates("page");

    expect(result).toContain("https://zoom.us/j/123456789");
    expect(result.some((s) => s.includes("Zoomに参加"))).toBe(true);
  });

  it("空白のみのテキストノードは収集しない", () => {
    document.body.innerHTML = `<div>   </div><div>本文</div>`;

    const result = collectCandidates("page");

    expect(result).not.toContain("   ");
    expect(result).toContain("本文");
  });

  it("href属性の生値を収集する（.hrefによる絶対URL解決はしない）（Stage5実装レビューで発見）", () => {
    document.body.innerHTML = `<a href="#">ヘルプ</a><a href="/relative/path">相対リンク</a>`;

    const result = collectCandidates("page");

    // .hrefで解決すると現在ページ（about:blank等）のURLが混入するが、
    // 生の属性値であればそのような絶対URLへの変換は起こらない。
    expect(result).toContain("#");
    expect(result).toContain("/relative/path");
    expect(result.some((s) => s.startsWith("http://") || s.startsWith("https://"))).toBe(false);
  });
});

describe("collectCandidates：選択範囲モード", () => {
  it("選択が無い場合はページ全体へフォールバックする", () => {
    document.body.innerHTML = `<p>https://zoom.us/j/123456789</p>`;
    const selection = window.getSelection();
    selection?.removeAllRanges();

    const result = collectCandidates("selection");

    expect(result.some((s) => s.includes("https://zoom.us/j/123456789"))).toBe(true);
  });

  it("選択範囲内のテキストのみを収集し範囲外を含めない", () => {
    document.body.innerHTML = `<p id="in">https://zoom.us/j/123456789</p><p id="out">https://meet.google.com/abc-defg-hij</p>`;
    const inEl = document.getElementById("in") as HTMLParagraphElement;
    const range = document.createRange();
    range.selectNodeContents(inEl);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const result = collectCandidates("selection");

    expect(result.some((s) => s.includes("zoom.us"))).toBe(true);
    expect(result.some((s) => s.includes("meet.google.com"))).toBe(false);
  });

  it("選択範囲内のhrefも収集する", () => {
    document.body.innerHTML = `<div id="in"><a href="https://zoom.us/j/123456789">参加</a></div><div id="out"><a href="https://meet.google.com/abc-defg-hij">参加</a></div>`;
    const inEl = document.getElementById("in") as HTMLDivElement;
    const range = document.createRange();
    range.selectNodeContents(inEl);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const result = collectCandidates("selection");

    expect(result).toContain("https://zoom.us/j/123456789");
    expect(result).not.toContain("https://meet.google.com/abc-defg-hij");
  });
});
