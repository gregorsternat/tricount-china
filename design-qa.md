# Design QA

## Reference and capture contract

- Selected direction: option 1, the dense desktop dashboard with a fixed navigation rail, dark financial hero, import actions, category breakdown, transaction feed and contextual right rail.
- Source: `/Users/sternatgregor/.codex/generated_images/01a0564a-ee17-7200-9b02-93204c1e000c/exec-41b4ae40-d32d-4b52-b628-caabec5f2c17.png`.
- Source dimensions: 1487 × 1058. For comparison it was resized proportionally to 1270 px wide, then cropped from the top to 1270 × 714.
- Browser-rendered implementation: `docs/design-qa-implementation-final.png`, 1270 × 714 at density 1.
- Same-frame comparison: `docs/design-qa-comparison-final.png`, source on the left and implementation on the right.
- State: realistic personal demo dashboard for the 2025–2026 student year in China.

## Iteration history

1. The first build reproduced the information architecture but the hero and import block were too tall for the reference density. Severity: P2. The header, hero, chart and import controls were compacted.
2. The second build still gave import guidance too much vertical weight. Severity: P2. Copy, provider actions and status metadata were tightened while preserving privacy guidance.
3. The navigation rail remained visually wider than the reference. Severity: P2. It was reduced to 224 px and the main canvas was allowed to carry more analytical density.
4. Product-state review found implicit sharing, static insights and static dates. Severity: P1/P2. Sharing now requires an explicit tricount and confirmation; advice, period dates, merchant visits and budget states are derived from real data.

## Interaction evidence

- Personal/tricount scope switch updates metrics, transactions, balances and the right rail.
- Manual expense opens with a date constrained to the active academic period and remains private by default.
- Wallet sharing opens a dedicated confirmation, requires an explicit destination and explains member visibility.
- WeChat Pay import advertises CSV/XLSX, Alipay advertises CSV, and the raw-file privacy boundary is visible.
- Group balances enable settlement only for members on the opposite side of the current user's balance.
- Search, category filtering, transaction expansion, budget editing, group creation and invitation entry points are wired.
- Browser console history contained no warnings or errors from the application; only standard React development and hot-reload messages were present.
- Responsive breakpoints and overflow paths were reviewed in code. The reference comparison is intentionally scoped to the selected desktop direction because the browser retained its desktop viewport when a temporary mobile override was requested; the override was reset before handoff.

## Final assessment

The implementation follows the selected visual direction while adapting it to the private student-year finance model. No actionable P0, P1 or P2 visual issue remains in the reference viewport.

result: passed
