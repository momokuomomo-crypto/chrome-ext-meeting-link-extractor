# ai-build-council 実行記録：会議URL抽出クリップボードツール

- run-id: `20260721-1537-meeting-link-extractor`
- 対象リポジトリ: https://github.com/momokuomomo-crypto/chrome-ext-meeting-link-extractor
- commit: `bfb42f0`（main push済み）
- 稟議書出典: [ai-council-output 稟議書_Chrome拡張機能アイデア.md](https://github.com/momokuomomo-crypto/ai-council-output/blob/master/chrome-extension-ideas/稟議書_Chrome拡張機能アイデア.md) B-10

## 概要

任意のWebページで、ユーザー操作時だけ（ツールバーボタン／右クリック
メニュー）「選択範囲」または「ページ全体」からZoom／Google Meet／
Microsoft Teamsの会議URLを検出し、クリップボードへコピーする汎用Chrome
拡張機能（Manifest V3）。常駐content_script・host_permissionsは使わず、
`activeTab`＋`scripting`＋`contextMenus`のみで完結する。DOM収集専用の
注入関数・DOM非依存の抽出検証ロジック・クリップボード書き込み専用の
注入関数という3段階アーキテクチャを採用し、サービス別URL判定ロジックを
通常のvitestでテーブル駆動テストできるようにした。

## 実施ステージ

Stage0（Intake）→ Stage1（Codex CLI独立設計）→ Stage2（Claude査読、
「差し戻し」判定。自己完結注入関数とテーブル駆動単体テストの構造的
矛盾など4件のmajorを議長Fableが直接修正して凍結）→ Stage3（議長Fable
本体による実装）→ Stage4（Test Gate A：48テスト・typecheck・lint・
build 全通過）→ Stage5（固定diffの独立実装レビュー：Codex CLI＋Claude
Agentサブエージェントを並列実行、判定が食い違いコードを直接再読して
事実確認）→ Stage6（指摘対応・Test Gate B：56テスト・typecheck・lint・
build 全通過）→ Stage7（commit・push）。

## Stage2で発見・修正した主な指摘

Claude査読は「差し戻し（要修正）」と判定。全て議長Fableが直接設計へ
反映し凍結した（詳細は
[.ai-build-council/runs/20260721-1537-meeting-link-extractor/decisions/stage2-design-review-decisions.md](../../.ai-build-council/runs/20260721-1537-meeting-link-extractor/decisions/stage2-design-review-decisions.md)、
ローカルのみ・.gitignore対象）。

- **[major]** 自己完結注入関数と「テーブル駆動単体テスト」というテスト
  戦略が構造的に両立しない。→ DOM収集専用の注入関数（判定ロジック
  無し）・DOM非依存の判定ロジック（通常import可能）・クリップボード
  書き込み専用の注入関数、という3段階へアーキテクチャを分離。
- **[major]** URL末尾の句読点除去アルゴリズムが未定義。→ 文字集合を
  明記し、`+$`による一括除去方式に確定。
- **[major]** ホスト名検証の実装契約（コードレベル）が未確定。→
  `hostMatches()`関数をそのままコード契約として明記。
- **[major]** Outlook Safe Links等のURL書き換えゲートウェイが未検討。
  → 対象外として明記。

## Stage5で発見・修正した主な指摘

Codex CLI（提案席）とClaude Agent（査読席、isolated）を並列実行した
ところ、判定が一致しなかった（Codex＝「要修正」、Claude＝「承認（軽微な
指摘のみ）」）。Codexの指摘をコード直読で事実確認したところ、いずれも
実際の不具合であり、Claudeがこれらを見逃していたことを確認した（詳細は
[decisions/stage5-implementation-review-decisions.md](../../.ai-build-council/runs/20260721-1537-meeting-link-extractor/decisions/stage5-implementation-review-decisions.md)）。

- **[blocker]** `a[href]`収集に`.href`（解決済み絶対URL）を使っており、
  `<a href="#">`のような無関係なリンクが現在ページのURLとして誤って
  収集されうる（Codexが発見、Claudeは見逃した）。→ `getAttribute
  ("href")`で属性の生値を収集するよう修正。
- **[blocker]** 日本語の全角括弧類（【】［］｛｝〈〉《》等）の末尾記号
  除去が網羅されておらず、「【会議URL：https://...】」のような表記で
  抽出に失敗する（Codexが発見、Claudeは見逃した）。→ 文字クラスへ追加。
- **[major]** Teams従来形式のパスパターンが過度に広く、会議識別子として
  成立しない任意文字列も受理してしまう（Codexが発見、Claudeは見逃した）。
  → 実際の会議スレッド識別子形式へパターンを狭めた。
- **[major]** エラー表示APIの一部（バッジ）が失敗すると、利用可能な
  別のフィードバック（タイトル）も試されない（Codexが発見、Claudeは
  見逃した）。→ 各APIを個別にtry/catchするよう修正。
- **[major]** 同一タブへの多重発火（連打）に対する排他制御が無い
  （Claudeが発見）。→ タブIDごとの実行中セットで新規呼び出しを無視する
  ガードを追加。

いずれも実装で解消し、Test Gate Bで全56テストが通過することを確認した。

## 未解決・今後の検討事項

- Chrome Web Store公開に向けたストア掲載文言・プライバシーポリシー・
  スクリーンショット等は未着手。
- Outlook Safe Links等のURL書き換えゲートウェイ、同一オリジンiframe内の
  会議URL、Zoomパーソナル会議室リンク（`/my/vanityname`形式）は、
  いずれも今回のMVPでは対象外（凍結設計で明示的に許容している判断）。
- 実ブラウザでの動作確認（Gmail・Slack Web等の実際のメール本文での
  抽出精度）は未実施。
- Stage5で2つの独立レビュワーの判定が食い違った際、必ずコードを直接
  読んで事実確認する必要があることを、B-8に続き本件でも再確認した
  （今回はCodexの指摘が正しく、Claudeが見逃していた）。
