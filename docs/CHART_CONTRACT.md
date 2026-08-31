# Fēn dashboard chart contract

## Monthly spending and budget

- **Question:** How has spending evolved across the selected academic year, and is the current month on budget?
- **Takeaway:** Actual monthly spend is read from bars; a budget reference line makes overruns visible without implying a forecast.
- **Family:** Trend; twelve monthly points at month grain.
- **Surface:** Recharts `ComposedChart`, CNY on a zero-based y-axis, compact French month labels, exact values in the tooltip.
- **Data sufficiency:** Render the trend with at least eight observed months. With fewer observations, show discrete month bars and label data coverage instead of drawing a misleading line.
- **Palette:** Sage bars (`#86a58f`), terracotta current/over-budget bar (`#d96b47`), dotted terracotta budget line, neutral grid and labels. Bars remain distinct from the budget by both mark type and line style.
- **Footprint:** Wide hero chart on desktop, full-width horizontal-scroll-safe chart on mobile.

## Spending by category

- **Question:** Which categories account for the selected period's spending?
- **Takeaway:** The view shows the four largest categories plus “Autres”, with the denominator and coverage visible.
- **Family:** Composition; compact donut because the selected visual target explicitly uses a circular part-to-whole summary and keeps the slice count below six.
- **Surface:** Recharts `PieChart`, direct legend rows with amount and percentage; no redundant chart legend.
- **Data sufficiency:** Hide the chart when there are no expenses. Collapse categories beyond the top four into “Autres”.
- **Palette:** Fixed semantic category colors derived from the Fēn palette; labels and percentages provide a non-color reading path.
- **Footprint:** 280–320 px desktop panel, stacked above the ledger on narrow screens.

## Shared balances

- **Question:** Who should receive or reimburse money now?
- **Takeaway:** Exact balances and settlement actions matter more than shape.
- **Family:** Table/scorecard, not a chart. A small two-tone decorative overlap from the mock is intentionally omitted because it adds no quantitative meaning.
