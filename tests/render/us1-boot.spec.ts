import { test, expect } from '@playwright/test';
import { expectGolden } from '../golden/harness';

// T012（US1 集成）：boot → 首帧 → 度量四项 → resize → dispose 守卫（FR-002/003/016）
test('US1: createRuntime 启动空场景，度量/resize/dispose 契约成立', async ({ page }) => {
  await page.goto('/us1-boot.html');
  await expect(page.locator('canvas')).toBeVisible();

  // 度量快照字段全集（data-model §1.7）
  const snap1 = await page.evaluate(() => window.__rt!.metrics.snapshot());
  expect(Object.keys(snap1).sort()).toEqual(
    ['drawCalls', 'fps', 'geometries', 'jsHeapBytes', 'textures', 'triangles'],
  );

  // 首帧已渲染：fps 在运行 ~400ms 后可用（rAF 时间戳驱动）
  await page.waitForTimeout(400);
  const snap2 = await page.evaluate(() => window.__rt!.metrics.snapshot());
  expect(snap2.fps).not.toBeNull();
  expect(snap2.fps!).toBeGreaterThan(0);
  expect(typeof snap2.drawCalls).toBe('number');
  expect(typeof snap2.triangles).toBe('number');

  // resize 生效（画布像素尺寸更新）
  await page.evaluate(() => window.__rt!.resize(400, 300));
  const dims = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    return { w: c.width, h: c.height };
  });
  expect(dims).toEqual({ w: 400, h: 300 });

  // dispose：资源释放 + 后续公共调用 → E_RUNTIME_DISPOSED（结构化错误形态）
  await page.evaluate(() => window.__rt!.dispose());
  const err = await page.evaluate(() => {
    try {
      window.__rt!.start();
      return null;
    } catch (e) {
      const te = e as { code?: string; name?: string; message?: string };
      return { code: te.code, name: te.name, messageIncludesCode: te.message?.includes('E_RUNTIME_DISPOSED') };
    }
  });
  expect(err).toEqual({ code: 'E_RUNTIME_DISPOSED', name: 'ThreedError', messageIncludesCode: true });
});

// T017：空场景黄金基线（SwiftShader 软件渲染，跨机器确定；容差记录于 tests/golden/tolerances.json）
test('US1: 空场景黄金图', async ({ page }) => {
  await page.goto('/us1-boot.html');
  await page.waitForTimeout(300); // 首帧稳定
  await expectGolden(page, 'us1/empty-scene');
});
