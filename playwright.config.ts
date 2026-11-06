import { defineConfig } from '@playwright/test';

// 渲染冒烟 / 黄金图比对 / 交互模拟 / http 端到端（tests/ 目录）。
// SwiftShader 启动参数由 T005 探针（tests/probe/webgl2-probe.spec.ts）验证后固化于 launchOptions。
export default defineConfig({
  testDir: 'tests',
  // Playwright 只认 *.spec.ts；单元/契约 *.test.ts 归 vitest（避免互相误扫）
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // 黄金图基线统一归档于 tests/golden/（Playwright 托管命名：<spec>-snapshots/<name>-<platform>.png，
  // 容差登记于 tests/golden/tolerances.json，比对入口唯一：tests/golden/harness.ts）
  snapshotDir: 'tests/golden',
  webServer: {
    command: 'npx vite --config tests/vite.config.ts --port 5179 --strictPort',
    url: 'http://localhost:5179/us1-boot.html',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:5179',
    viewport: { width: 800, height: 600 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // SwiftShader 启动参数由 tests/probe/webgl2-probe.spec.ts（T005）验证后固化
        launchOptions: {
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
});
