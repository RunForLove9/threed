import { test, expect } from '@playwright/test';

// T020（SC-005）：空场景连续运行 60s——度量全程可读、jsHeap 无持续单调增长。
// 判定：前 1/4 窗口均值 vs 后 1/4 窗口均值，涨幅 ≤ 10%（允许 GC 波动）。
test('US1: 空场景 60s 泄漏冒烟', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/us1-boot.html');
  const samples = await page.evaluate(async () => {
    const heaps: number[] = [];
    const fpsOk: boolean[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 60_000) {
      const s = window.__rt!.metrics.snapshot();
      fpsOk.push(s.fps === null || s.fps > 0); // 启动初期 fps 可为 null
      const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory;
      heaps.push(mem ? mem.usedJSHeapSize : 0);
      await new Promise((r) => setTimeout(r, 500));
    }
    return { heaps, fpsOk };
  });
  // 度量全程可读
  expect(samples.fpsOk.every(Boolean)).toBe(true);
  // 堆内存：无持续增长（前后 1/4 均值比较）
  const q = Math.max(1, Math.floor(samples.heaps.length / 4));
  const head = samples.heaps.slice(0, q).reduce((a, b) => a + b, 0) / q;
  const tail = samples.heaps.slice(-q).reduce((a, b) => a + b, 0) / q;
  expect(tail, `堆内存持续增长: head=${(head / 1e6).toFixed(1)}MB tail=${(tail / 1e6).toFixed(1)}MB`).toBeLessThan(
    head * 1.1,
  );
});
