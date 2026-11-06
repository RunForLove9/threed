import { test, expect } from '@playwright/test';

// T053：标准场景（fixtures/standard-scene.json：11 节点 + 5 mesh + 交互声明）基线度量
// 数值记录于 docs/perf-baseline.md，作为宪法性能预算写回提案的依据（写回本身需独立宪法修订）。
test('perf baseline：标准场景度量采样', async ({ page }) => {
  await page.goto('/perf-baseline.html');
  await page.waitForTimeout(300);
  const snap = await page.evaluate(() => (window as unknown as { __perf: () => Promise<Record<string, unknown>> }).__perf());
  console.log('[perf-baseline]', JSON.stringify(snap));
  expect(snap.fps as number).toBeGreaterThan(0);
  expect(snap.drawCalls as number).toBeGreaterThanOrEqual(5);
  expect(snap.triangles as number).toBeGreaterThan(1000);
});
