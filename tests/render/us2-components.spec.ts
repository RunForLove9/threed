import { test, expect } from '@playwright/test';
import { expectGolden } from '../golden/harness';

// T022（US2）：12 内置组件逐个孤立冒烟（US2 期 10 个；US4 增 pickable/orbit 后矩阵自动扩至 12）
// T029：可视组件黄金基线（mesh×5 + environment）
interface RtInfo {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  testedId: string;
}

const TYPES = [
  'core.group',
  'core.camera.perspective',
  'core.mesh.box',
  'core.mesh.sphere',
  'core.mesh.plane',
  'core.mesh.cylinder',
  'core.mesh.torus',
  'core.light.ambient',
  'core.light.directional',
  'core.environment',
  'core.pickable', // US4 marker：孤立 mount/dispose 冒烟（无可见几何，不做黄金图）
  'core.control.orbit',
];
const MESHES = TYPES.filter((t) => t.startsWith('core.mesh.'));
const GOLDEN_TYPES = [...MESHES, 'core.environment'];

async function readInfo(page: import('@playwright/test').Page): Promise<RtInfo> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __rt: {
        escape: { renderer(): { info: { render: { calls: number; triangles: number }; memory: { geometries: number; textures: number } } } };
      };
      __testedId: string;
    };
    const info = w.__rt.escape.renderer().info;
    return { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, testedId: w.__testedId };
  });
}

for (const type of TYPES) {
  test(`US2 组件冒烟：${type}`, async ({ page }) => {
    await page.goto(`/us2-component.html?type=${encodeURIComponent(type)}`);
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForTimeout(300); // 首帧渲染 + geometry 编译

    const info = await readInfo(page);
    expect(info.testedId).toBeTruthy();
    if (MESHES.includes(type)) {
      expect(info.triangles, `${type} 应产出三角形`).toBeGreaterThan(0);
      expect(info.geometries, `${type} 应登记几何`).toBeGreaterThanOrEqual(1);
    }

    // dispose 后实例级资源即时归零（FR-016 / 契约 component-authoring §2.3）
    const after = await page.evaluate(() => {
      const w = window as unknown as {
        __rt: { dispose(): void; escape: { renderer(): { info: { memory: { geometries: number } } } } };
      };
      w.__rt.dispose();
      return w.__rt.escape.renderer().info.memory.geometries;
    });
    expect(after, 'dispose 后 geometry 计数应归零').toBe(0);
  });
}

for (const type of GOLDEN_TYPES) {
  test(`US2 黄金图：${type}`, async ({ page }) => {
    await page.goto(`/us2-component.html?type=${encodeURIComponent(type)}`);
    await page.waitForTimeout(300);
    await expectGolden(page, `us2/${type.replace(/\./g, '-')}`);
  });
}
