import { test } from '@playwright/test';
import { expectGolden } from './harness';

// T010 harness 自检：固定色板页截图比对（验证基线生成/比对链路本身可用）。
// 首次生成基线：npx playwright test harness.dryrun --update-snapshots
test('golden harness dry-run：固定色板', async ({ page }) => {
  await page.setContent(
    `<style>body{margin:0}div{width:100vw;height:100vh;background:linear-gradient(#e8b04b,#101014)}</style><div></div>`,
  );
  await expectGolden(page, 'dryrun/color-plate');
});
