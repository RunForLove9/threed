import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { z } from 'zod';
import { SceneGraph } from '../src/scene/scene-graph';
import { registerBuiltinComponents, BUILTIN_TYPES } from '../src/component/builtins';
import { ComponentRegistry, defineComponent } from '../src/component/registry';

// T021（US2 契约）：注册表规则 + 场景 CRUD + props 校验 + 嵌套变换 + 相机树序规则
// 场景图/Object3D 均为纯逻辑（无需 WebGL），Node 直接测。

function makeGraph(): SceneGraph {
  const g = new SceneGraph();
  registerBuiltinComponents(g.registry);
  return g;
}
const code = (e: unknown): string | undefined => (e as { code?: string }).code;
const details = (e: unknown): Record<string, unknown> => ((e as { details?: Record<string, unknown> }).details ?? {});

describe('注册表（FR-004）', () => {
  it('内置 10 组件预装成功', () => {
    const g = makeGraph();
    for (const t of BUILTIN_TYPES) expect(g.registry.has(t)).toBe(true);
    expect(g.registry.list().length).toBeGreaterThanOrEqual(10);
  });

  it('第三方注册 core./asset. 前缀拒绝（E_TYPE_UNKNOWN）', () => {
    const r = new ComponentRegistry();
    for (const bad of ['core.x', 'asset.gltf']) {
      const def = defineComponent({ type: bad, category: 'group', props: zObject(), mount: () => new THREE.Group() });
      try {
        r.register(def);
        expect.unreachable(`${bad} 应被拒绝`);
      } catch (e) {
        expect(code(e)).toBe('E_TYPE_UNKNOWN');
        expect(details(e).type).toBe(bad);
      }
    }
  });

  it('重复注册默认拒绝（E_TYPE_DUPLICATE），显式 override 放行', () => {
    const r = new ComponentRegistry();
    const def = defineComponent({ type: 'my.box', category: 'group', props: zObject(), mount: () => new THREE.Group() });
    r.register(def);
    try {
      r.register(def);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_TYPE_DUPLICATE');
    }
    expect(() => r.register(def, { override: true })).not.toThrow();
  });
});

function zObject() {
  return z.strictObject({});
}

describe('场景 CRUD（FR-005/FR-020）', () => {
  it('create：默认值填充 + 显式 ID + 系统 ID', () => {
    const g = makeGraph();
    const box = g.ops.create('core.mesh.box', {}, { id: 'my-box' });
    expect(box.id).toBe('my-box');
    expect(box.props).toMatchObject({
      position: [0, 0, 0],
      material: { color: '#9aa4b2', roughness: 0.55, metalness: 0.1, opacity: 1, transparent: false, wireframe: false },
      geometry: { size: [1, 1, 1], segments: [1, 1, 1] },
    });
    const auto = g.ops.create('core.group');
    expect(auto.id).toMatch(/^i[A-Za-z0-9]{11}$/);
  });

  it('create：未注册类型 / asset.* → E_TYPE_UNKNOWN，树不变', () => {
    const g = makeGraph();
    const before = JSON.stringify(g.ops.get('__root__'));
    for (const bad of ['nope.mesh', 'asset.gltf']) {
      try {
        g.ops.create(bad);
        expect.unreachable();
      } catch (e) {
        expect(code(e)).toBe('E_TYPE_UNKNOWN');
      }
    }
    expect(JSON.stringify(g.ops.get('__root__'))).toBe(before);
  });

  it('create：非法 props → E_PROPS_INVALID 定位 instanceId+propPath', () => {
    const g = makeGraph();
    try {
      g.ops.create('core.mesh.box', { material: { color: 'red' } }, { id: 'bx' });
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_PROPS_INVALID');
      expect(details(e)).toMatchObject({ instanceId: 'bx', propPath: 'material.color' });
    }
    // 多余字段拒绝（spec 澄清 Q3：strict）
    try {
      g.ops.create('core.mesh.box', { extra: 1 });
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_PROPS_INVALID');
      expect(String(details(e).propPath)).toContain('extra');
    }
    // 值域守卫：函数值拒绝
    try {
      g.ops.create('core.group', { position: [0, 0, (() => 1) as unknown as number] });
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_PROPS_INVALID');
    }
  });

  it('ID：非法显式 ID（E_ID_INVALID）与冲突（E_ID_CONFLICT）', () => {
    const g = makeGraph();
    g.ops.create('core.group', {}, { id: 'a' });
    try {
      g.ops.create('core.group', {}, { id: '1bad' });
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_ID_INVALID');
    }
    try {
      g.ops.create('core.group', {}, { id: 'a' });
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_ID_CONFLICT');
    }
  });

  it('update：浅合并 + 不存在实例 E_INSTANCE_NOT_FOUND', () => {
    const g = makeGraph();
    const b = g.ops.create('core.mesh.box', {}, { id: 'bx' });
    void b;
    g.ops.update('bx', { position: [1, 2, 3] });
    expect(g.ops.get('bx')!.props).toMatchObject({ position: [1, 2, 3] });
    try {
      g.ops.update('missing', {});
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_INSTANCE_NOT_FOUND');
    }
  });

  it('remove：子树递归移除', () => {
    const g = makeGraph();
    const p = g.ops.create('core.group', {}, { id: 'p' });
    void p;
    g.ops.create('core.mesh.box', {}, { id: 'c1', parent: 'p' });
    g.ops.create('core.mesh.box', {}, { id: 'c2', parent: 'p' });
    g.ops.remove('p');
    expect(g.ops.get('p')).toBeNull();
    expect(g.ops.get('c1')).toBeNull();
    expect(g.ops.get('c2')).toBeNull();
  });

  it('move：合法换父；移入自身子树拒绝', () => {
    const g = makeGraph();
    const a = g.ops.create('core.group', {}, { id: 'a' });
    void a;
    const b = g.ops.create('core.group', {}, { id: 'b' });
    void b;
    g.ops.create('core.group', {}, { id: 'a1', parent: 'a' });
    // 环检查：a1 仍在 a 子树内，把 a 移到 a1 下必须拒绝
    try {
      g.ops.move('a', 'a1');
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_TREE_TOO_DEEP');
    }
    // 合法换父
    g.ops.move('a1', 'b');
    expect(g.ops.get('a1')).not.toBeNull();
  });

  it('嵌套变换：父动子随（世界变换）', () => {
    const g = makeGraph();
    g.ops.create('core.group', { position: [0, 1, 0] }, { id: 'p' });
    g.ops.create('core.group', { position: [0, 1, 0] }, { id: 'c', parent: 'p' });
    g.threeScene.updateMatrixWorld(true);
    const world = new THREE.Vector3();
    (g.objectOf('c') as THREE.Object3D).getWorldPosition(world);
    expect([world.x, world.y, world.z]).toEqual([0, 2, 0]);
  });

  it('环境单例：第二个 E_ENV_DUPLICATE', () => {
    const g = makeGraph();
    g.ops.create('core.environment');
    try {
      g.ops.create('core.environment');
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_ENV_DUPLICATE');
    }
  });
});

describe('激活相机规则（树序第一个 + 运行时切换）', () => {
  it('树序（DFS 先序）第一相机为激活相机；删除后顺延', () => {
    const g = makeGraph();
    const gA = g.ops.create('core.group', {}, { id: 'gA' });
    const gB = g.ops.create('core.group', {}, { id: 'gB' });
    void gA; void gB;
    const camB = g.ops.create('core.camera.perspective', {}, { id: 'camB', parent: 'gB' });
    void camB;
    expect(g.ops.activeCameraId()).toBe('camB');
    const camA = g.ops.create('core.camera.perspective', {}, { id: 'camA', parent: 'gA' });
    void camA;
    expect(g.ops.activeCameraId()).toBe('camA'); // gA 先于 gB（DFS 先序）
    g.ops.remove('camA');
    expect(g.ops.activeCameraId()).toBe('camB');
  });

  it('setActiveCamera：非相机实例拒绝；切换生效；删除切换目标回落树序', () => {
    const g = makeGraph();
    const box = g.ops.create('core.group', {}, { id: 'box' });
    void box;
    const cam1 = g.ops.create('core.camera.perspective', {}, { id: 'cam1' });
    void cam1;
    const cam2 = g.ops.create('core.camera.perspective', {}, { id: 'cam2' });
    void cam2;
    try {
      g.ops.setActiveCamera('box');
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_PROPS_INVALID');
    }
    g.ops.setActiveCamera('cam2');
    expect(g.ops.activeCameraId()).toBe('cam2');
    g.ops.remove('cam2');
    expect(g.ops.activeCameraId()).toBe('cam1');
  });
});
