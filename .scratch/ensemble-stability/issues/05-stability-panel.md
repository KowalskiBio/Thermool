# 05: Stability panel

Status: resolved

`StabilityPanel.tsx` between PropertiesTable and StructurePanel:
per-strand stacked strip with legend (1-decimal percentages, `<0.1%`
dimmed), equilibrium temperature input + spinner, 500 ms debounce with
stale-response guard, converged warning, two-way vs three-way segments
per the equilibrium split setting.

Blocked by: 03, 04

## Answer

Done. `StabilityPanel.tsx` between PropertiesTable and StructurePanel: stacked strips with <0.1% handling, two-state vs ensemble note, converged warning, 500 ms debounced fetch with stale guard, equilibrium temperature input (0-99 C).
