import { test, expect, chromium } from '@playwright/test';

// T005（research.md R1 Verification task）：
// 验证当前 Playwright Chromium 下可用的 SwiftShader 软件渲染启动参数组合，
// 产出：① 可用组合固化进 playwright.config.ts；② 结论回写 research.md R1。

/** 页内探针：WebGL2 上下文 + 渲染器名 + 单三角渲染非黑像素数。 */
async function probeWebgl2(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const gl = canvas.getContext('webgl2');
    if (!gl) return { contextOk: false as const };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));

    // 清屏为红色 → 至少 64px 非黑（验证真渲染路径）
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const px = new Uint8Array(4 * 16); // 中心 4x4
    gl.readPixels(30, 30, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let nonBlack = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i]! + px[i + 1]! + px[i + 2]! > 30) nonBlack++;
    }
    return { contextOk: true as const, renderer, nonBlack };
  });
}

test('默认上下文（config 当前 launchOptions）具备 WebGL2 且能渲染', async ({ page }) => {
  await page.goto('about:blank');
  const r = await probeWebgl2(page);
  test.info().annotations.push({ type: 'renderer', description: r.contextOk ? r.renderer : 'NO_CONTEXT' });
  expect(r.contextOk).toBe(true);
  expect(r.nonBlack).toBeGreaterThan(0);
});

test('R1 参数矩阵：确定 SwiftShader 组合并记录渲染器名', async () => {
  const combos: Array<{ label: string; args: string[] }> = [
    { label: 'no-args', args: [] },
    { label: 'angle-swiftshader', args: ['--use-angle=swiftshader'] },
    { label: 'angle+unsafe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    { label: 'unsafe-only', args: ['--enable-unsafe-swiftshader'] },
  ];
  const results: Array<{ label: string; contextOk: boolean; renderer: string; nonBlack: number }> = [];
  for (const c of combos) {
    try {
      const browser = await chromium.launch({ args: c.args });
      const page = await browser.newPage();
      const r = await probeWebgl2(page);
      results.push({ label: c.label, contextOk: r.contextOk, renderer: r.contextOk ? r.renderer : '-', nonBlack: r.contextOk ? r.nonBlack : 0 });
      await browser.close();
    } catch (e) {
      results.push({ label: c.label, contextOk: false, renderer: `LAUNCH_FAIL: ${String(e).slice(0, 80)}`, nonBlack: 0 });
    }
  }
  console.table(results);
  // 至少一个组合落到 SwiftShader 软件渲染且渲染路径出像素（CI 无 GPU 环境的依赖前提）
  const swift = results.filter((r) => /swiftshader/i.test(r.renderer) && r.nonBlack > 0);
  expect(swift.length, `SwiftShader 组合必须存在，实测: ${JSON.stringify(results)}`).toBeGreaterThan(0);
});
