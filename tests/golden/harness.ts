import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

// T010：黄金图基线设施——全部基线比对的唯一入口。
// 基线文件由 Playwright 托管：snapshotDir=tests/golden（config），命名 <spec>-snapshots/<name>-<project><-platform>.png；
// 容差随基线登记于 tests/golden/tolerances.json（键 = expectGolden 的 name，基线 = 契约的一部分）。
export interface GoldenTolerance {
  maxDiffPixelRatio?: number;
  maxDiffPixels?: number;
  threshold?: number;
}

const tolerances: Record<string, GoldenTolerance> = JSON.parse(
  readFileSync(fileURLToPath(new URL('./tolerances.json', import.meta.url)), 'utf8'),
) as Record<string, GoldenTolerance>;

/** 固定视口与确定性前提（SwiftShader 软件渲染，跨机器确定）。 */
export const GOLDEN_VIEWPORT = { width: 800, height: 600 } as const;

export async function expectGolden(page: Page, name: string): Promise<void> {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    ...((tolerances[name] as GoldenTolerance | undefined) ?? {}),
  });
}
