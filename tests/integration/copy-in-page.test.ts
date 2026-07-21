import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyTextInPage } from "../../src/inject/copy-in-page";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function getToastText(): string | undefined {
  const host = document.documentElement.querySelector("div");
  return host?.shadowRoot?.textContent ?? undefined;
}

let originalClipboard: Clipboard | undefined;
let originalExecCommand: typeof document.execCommand;

beforeEach(() => {
  originalClipboard = (navigator as unknown as { clipboard?: Clipboard }).clipboard;
  originalExecCommand = document.execCommand;
});

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", { value: originalClipboard, configurable: true });
  } else {
    delete (navigator as unknown as { clipboard?: Clipboard }).clipboard;
  }
  document.execCommand = originalExecCommand;
  document.querySelectorAll("textarea").forEach((el) => el.remove());
  document.documentElement.querySelectorAll("div").forEach((el) => el.remove());
});

describe("copyTextInPage", () => {
  it("textがnullの場合はクリップボードへ触れずmessageをそのまま表示する", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    copyTextInPage(null, "会議URLが見つかりませんでした");
    await flushMicrotasks();

    expect(writeText).not.toHaveBeenCalled();
    expect(getToastText()).toBe("会議URLが見つかりませんでした");
  });

  it("Clipboard APIが成功すれば渡されたmessageを表示する", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    copyTextInPage("https://zoom.us/j/123456789", "1件の会議URLをコピーしました");
    await flushMicrotasks();

    expect(writeText).toHaveBeenCalledWith("https://zoom.us/j/123456789");
    expect(getToastText()).toBe("1件の会議URLをコピーしました");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("Clipboard APIが拒否されればexecCommandへフォールバックする", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const execCommandSpy = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandSpy;

    copyTextInPage("https://zoom.us/j/123456789", "コピーしました");
    await flushMicrotasks();

    expect(execCommandSpy).toHaveBeenCalledWith("copy");
    expect(getToastText()).toBe("コピーしました");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("Clipboard APIもexecCommandも失敗すれば失敗トーストを表示する", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(false);

    copyTextInPage("https://zoom.us/j/123456789", "コピーしました");
    await flushMicrotasks();

    expect(getToastText()).toBe("コピーできませんでした");
  });

  it("execCommandフォールバック中にappendChildが例外を投げても、未処理rejectionにならず失敗トーストを表示する", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation(() => {
      throw new Error("appendChild not allowed");
    });

    copyTextInPage("https://zoom.us/j/123456789", "コピーしました");
    await flushMicrotasks();

    expect(getToastText()).toBe("コピーできませんでした");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
    appendChildSpy.mockRestore();
  });

  it("navigator.clipboard自体が存在しない場合はexecCommandへフォールバックする", async () => {
    delete (navigator as unknown as { clipboard?: Clipboard }).clipboard;
    const execCommandSpy = vi.fn().mockReturnValue(true);
    document.execCommand = execCommandSpy;

    copyTextInPage("https://zoom.us/j/123456789", "コピーしました");
    await flushMicrotasks();

    expect(execCommandSpy).toHaveBeenCalledWith("copy");
    expect(getToastText()).toBe("コピーしました");
  });

  it("トーストはShadow DOM内に生成され、一定時間後に削除される", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    copyTextInPage("https://zoom.us/j/123456789", "コピーしました");
    await vi.advanceTimersByTimeAsync(0);

    expect(document.documentElement.querySelectorAll("div")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2600);
    expect(document.documentElement.querySelectorAll("div")).toHaveLength(0);

    vi.useRealTimers();
  });
});
