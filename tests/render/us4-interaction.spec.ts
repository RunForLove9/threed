import { test, expect, type Page } from '@playwright/test';
import { expectGolden } from '../golden/harness';

// T035（US4 契约）：事件载荷 / 最近 pickable 祖先 / 无冒泡 / wheel / 键盘 / 相机变更节流 /
// orbit 行为与互斥 / 重入下一帧 / 交互随序列化往返保持
// 坐标策略：页面内用逃生舱 THREE 把世界坐标投影为屏幕坐标（确定性，不硬编码像素）。

interface Ev {
  type: string;
  targetId?: string;
  tag?: string;
  key?: string;
  code?: string;
  deltaY?: number;
  cameraId?: string;
  worldPoint?: number[] | null;
  screenPoint?: number[];
}
const evs = (page: Page) => page.evaluate(() => (window as unknown as { __events?: Ev[] }).__events ?? []);
const id = (page: Page, k: string) =>
  page.evaluate((key) => (window as unknown as { __ids: Record<string, string> }).__ids![key]!, k);
const screenOf = (page: Page, world: [number, number, number]) =>
  page.evaluate((w) => {
    const rt = window as unknown as {
      __rt: {
        scene: { activeCameraId(): string | null };
        escape: {
          sceneObject(id: string): { position: unknown } & Record<string, unknown>;
          renderer(): { domElement: HTMLCanvasElement };
          THREE: { Vector3: new (x: number, y: number, z: number) => { project(c: unknown): { x: number; y: number } } };
        };
      };
    };
    const cam = rt.__rt.escape.sceneObject(rt.__rt.scene.activeCameraId() ?? '') as unknown;
    const v = new rt.__rt.escape.THREE.Vector3(w[0], w[1], w[2]).project(cam);
    const r = rt.__rt.escape.renderer().domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, world);
const liveCamPos = (page: Page) =>
  page.evaluate(() => {
    const rt = window as unknown as {
      __rt: { scene: { activeCameraId(): string | null }; escape: { sceneObject(id: string): { position: { toArray(): number[] } } } };
    };
    const cid = rt.__rt.scene.activeCameraId();
    return cid ? rt.__rt.escape.sceneObject(cid).position.toArray() : null;
  });

async function clickAt(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

test('US4: pick 载荷 + 最近 pickable 祖先 + 无冒泡 + 不可拾取无事件', async ({ page }) => {
  await page.goto('/us4-interaction.html?scene=pick');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const w = window as unknown as { __sub: (f: { eventTypes?: string[] }, t: string) => void };
    w.__sub({ eventTypes: ['click', 'pointerenter', 'pointerleave'] }, 'global');
  });

  const parent = await id(page, 'parent');
  const ghost = await id(page, 'ghost');

  const soloPt = await screenOf(page, [1.5, 0.5, 0]); // soloBox（自带 pickable）
  const childPt = await screenOf(page, [-1, 0.5, 0]); // childBox → 最近 pickable 祖先 = parentGroup
  await clickAt(page, soloPt.x, soloPt.y);
  await clickAt(page, childPt.x, childPt.y);
  await page.waitForTimeout(150);

  const clicks = (await evs(page)).filter((e) => e.type === 'click');
  expect(clicks.length).toBe(2);
  expect(clicks[0]!.targetId).toBe(await id(page, 'solo'));
  expect(clicks[1]!.targetId, 'child 命中解析为最近 pickable 祖先（parentGroup）').toBe(parent);
  expect(Array.isArray(clicks[0]!.worldPoint)).toBe(true);
  expect(Array.isArray(clicks[0]!.screenPoint)).toBe(true);
  expect(clicks.map((c) => c.targetId)).not.toContain(ghost);

  // 无冒泡：parentGroup 定向订阅不应收到 solo 的点击
  await page.evaluate((pid) => {
    const w = window as unknown as { __sub: (f: { eventTypes?: string[]; componentId?: string }, t: string) => void };
    w.__sub({ eventTypes: ['click'], componentId: pid! }, 'parentOnly');
  }, parent);
  await clickAt(page, soloPt.x, soloPt.y);
  await page.waitForTimeout(120);
  expect((await evs(page)).filter((e) => e.tag === 'parentOnly').length).toBe(0);

  // enter/leave 形态
  await page.mouse.move(5, 5);
  await page.waitForTimeout(80);
  for (const e of (await evs(page)).filter((e) => e.type === 'pointerenter' || e.type === 'pointerleave')) {
    expect(typeof e.targetId).toBe('string');
    expect(Array.isArray(e.screenPoint)).toBe(true);
  }
});

test('US4: wheel + 键盘（标准键值）', async ({ page }) => {
  await page.goto('/us4-interaction.html?scene=plain');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const w = window as unknown as { __sub: (f: { eventTypes?: string[] }, t: string) => void };
    w.__sub({ eventTypes: ['wheel', 'keydown', 'keyup'] }, 'g');
  });
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, -120);
  await page.keyboard.press('a');
  await page.waitForTimeout(150);
  const list = await evs(page);
  expect(list.find((e) => e.type === 'wheel')).toMatchObject({ deltaY: -120 });
  expect(list.find((e) => e.type === 'keydown')).toMatchObject({ key: 'a', code: 'KeyA' });
  expect(list.find((e) => e.type === 'keyup')).toMatchObject({ key: 'a', code: 'KeyA' });
});

test('US4: orbit 拖拽改变活相机、camerachange 节流 ≤10/s、第二个 orbit 拒绝', async ({ page }) => {
  await page.goto('/us4-interaction.html?scene=orbit');
  await page.waitForTimeout(300);
  const camId = await id(page, 'cam');
  await page.evaluate((cid) => {
    const w = window as unknown as { __sub: (f: { eventTypes?: string[] }, t: string) => void };
    w.__sub({ eventTypes: ['camerachange'] }, 'cam');
    void cid;
  }, camId);

  // orbit 是行为态：拖拽改活相机 Object3D（数据 props 不变——数据/行为分离，宪法 III）
  const before = await liveCamPos(page);
  await page.mouse.move(400, 300);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(400 + i * 12, 300 + i * 5);
    await page.waitForTimeout(100);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after = await liveCamPos(page);
  expect(after, 'orbit 拖拽后活相机位置应变化').not.toEqual(before);

  const camEvents = (await evs(page)).filter((e) => e.type === 'camerachange');
  expect(camEvents.length).toBeLessThanOrEqual(18); // ~1.5s × 10/s + 余量
  for (const e of camEvents) expect(e.cameraId).toBe(camId);

  // 第二个 orbit → E_CONTROL_DUPLICATE
  const dup = await page.evaluate(() => {
    const w = window as unknown as { __rt: { scene: { create(t: string, p: unknown, o: { id: string }): unknown } } };
    try {
      w.__rt.scene.create('core.control.orbit', {}, { id: 'orbit2' });
      return 'created';
    } catch (e) {
      return (e as { code: string }).code;
    }
  });
  expect(dup).toBe('E_CONTROL_DUPLICATE');
});

test('US4: 重入语义——回调内 update 下一帧生效', async ({ page }) => {
  await page.goto('/us4-interaction.html?scene=pick');
  await page.waitForTimeout(300);
  const solo = await id(page, 'solo');
  await page.evaluate((sid) => {
    const w = window as unknown as {
      __rt: { events: { subscribe(f: { eventTypes?: string[] }, h: (e: Ev) => void): () => void }; scene: { update(id: string, p: unknown): void } };
    };
    w.__rt.events.subscribe({ eventTypes: ['click'] }, (e) => {
      if (e.targetId === sid) {
        w.__rt.scene.update(sid!, { position: [9, 9, 9] }); // 派发窗口内变更 → 排队下一帧
      }
    });
  }, solo);
  const pt = await screenOf(page, [1.5, 0.5, 0]);
  await clickAt(page, pt.x, pt.y);
  await page.waitForTimeout(300); // ≥2 帧
  const pos = await page.evaluate((sid) => {
    const w = window as unknown as { __rt: { scene: { get(id: string): { props: { position: number[] } } | null } } };
    return w.__rt.scene.get(sid!)?.props.position;
  }, solo);
  expect(pos).toEqual([9, 9, 9]);
});

test('US4: 含交互声明的场景序列化往返后交互等价生效', async ({ page }) => {
  await page.goto('/us4-interaction.html?scene=orbit');
  await page.waitForTimeout(300);
  const ok = await page.evaluate(() => {
    const w = window as unknown as { __rt: { scene: { serialize(): unknown; deserialize(d: unknown): void } } };
    const doc = w.__rt.scene.serialize();
    w.__rt.scene.deserialize(doc); // orbit 是树节点 → 随数据往返
    return doc;
  });
  expect((ok as { tree: { children: unknown[] } }).tree.children.length).toBeGreaterThanOrEqual(4);
  await page.waitForTimeout(200);

  const pos1 = await liveCamPos(page);
  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.move(550, 340, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const pos2 = await liveCamPos(page);
  expect(pos2, '往返后 orbit 仍生效（活相机位置变化）').not.toEqual(pos1);
  await expectGolden(page, 'us4/orbit-roundtrip');
});
