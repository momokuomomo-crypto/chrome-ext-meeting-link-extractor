# 会議URL抽出クリップボードツール

任意のWebページで、選択範囲またはページ全体からZoom/Google Meet/
Microsoft TeamsのURLを検出しコピーするChrome拡張機能（Manifest V3）。

[ai-council v2](https://github.com/momokuomomo-crypto/ai-council_v2)の
会合で検討・承認された
[稟議書](https://github.com/momokuomomo-crypto/ai-council-output/blob/master/chrome-extension-ideas/稟議書_Chrome拡張機能アイデア.md)
をもとに、
[ai-build-council](https://github.com/momokuomomo-crypto/ai-build-council)
のワークフローで設計・実装した。

## 主な機能

- ツールバーボタン、または右クリックメニューから、「選択範囲」または
  「ページ全体」の中からZoom/Google Meet/Microsoft Teamsの会議URLを検出
- 常駐content_script・host_permissionsは使わず、`activeTab`+
  `scripting`+`contextMenus`のみで完結（ユーザー操作時にのみ動作）
- DOM収集専用の注入関数・DOM非依存の抽出検証ロジック・クリップボード
  書き込み専用の注入関数、という3段階アーキテクチャで、サービス別URL
  判定ロジックを通常のvitestでテーブル駆動テストできるようにしている

## セットアップ

```bash
npm install
npm run build
```

`chrome://extensions` でデベロッパーモードを有効にし、
「パッケージ化されていない拡張機能を読み込む」で`dist/`を選択する。

## 開発

```bash
npm run dev         # 開発用ビルド（watch）
npm run typecheck
npm run lint
npm run test         # 単体・統合テスト（Vitest, sinon-chrome）
npm run build        # 本番ビルド
```

## ディレクトリ構成

```
src/
  background.ts                   # Service Worker（contextMenus・注入呼び出し）
  core/extract-meeting-urls.ts     # DOM非依存のURL抽出・判定ロジック
  inject/
    collect-candidates.ts          # DOM収集専用の注入関数
    copy-in-page.ts                 # クリップボード書き込み専用の注入関数
  types.ts
tests/
  unit/                             # 純粋関数のテーブル駆動単体テスト（Vitest）
  integration/                      # background.tsの統合テスト（sinon-chrome）
```

## 開発の経緯

[ai-build-council](https://github.com/momokuomomo-crypto/ai-build-council)
のゲート付きワークフロー（独立設計→設計査読→実装→テスト→固定diffの
独立実装レビュー→修正→記録）で設計・実装した。

設計査読の段階で、「自己完結した注入関数」という当初案が「テーブル駆動
単体テスト」という要求と構造的に両立しないことが判明し、DOM収集・
判定ロジック・クリップボード書き込みの3段階へアーキテクチャを分離した。

Codex CLIとClaude Agentを並列実行した実装レビューでは判定が食い違い
（Codex＝「要修正」、Claude＝「承認」）、コードを直接読んで事実確認した
結果、Codexが発見した複数の不具合（`<a href="#">`のような無関係なリンクを
`.href`経由で誤収集する、日本語の全角括弧類の末尾記号除去が網羅されて
おらず「【会議URL：https://...】」形式で抽出に失敗する等）が実際の不具合
であり、Claudeがこれらを見逃していたことを確認して修正した。
