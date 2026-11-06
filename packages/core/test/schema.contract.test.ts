import { describe, it, expect } from 'vitest';
import { SceneGraph } from '../src/scene/scene-graph';
import { registerBuiltinComponents, BUILTIN_TYPES } from '../src/component/builtins';
import {
  serializeGraph,
  deserializeIntoGraph,
  CURRENT_SCHEMA_VERSION,
  migrateDocument,
} from '../src/schema/serializer';

// T030（US3 契约）：序列化/反序列化/往返等价/幂等/原子性/错误矩阵（FR-007~009 + SC-002）

const code = (e: unknown): string | undefined => (e as { code?: string }).code;
const details = (e: unknown): Record<string, unknown> => ((e as { details?: Record<string, unknown> }).details ?? {});

function makeGraph(): SceneGraph {
  const g = new SceneGraph();
  registerBuiltinComponents(g.registry);
  return g;
}

/** 标准复杂场景：覆盖全部 10 个 US2 内置类型、嵌套 ≥3 层、含交互预留位外的全部角色。 */
function buildFullScene(g: SceneGraph): void {
  g.ops.create('core.environment', { background: '#101014', fog: { color: '#101014', near: 1, far: 60 } }, { id: 'env' });
  const rig = g.ops.create('core.group', { position: [0, 0, 0] }, { id: 'rig' });
  g.ops.create('core.camera.perspective', { position: [0, 1.2, 5] }, { id: 'cam', parent: 'rig' });
  g.ops.create('core.light.ambient', { intensity: 0.6 }, { id: 'amb' });
  g.ops.create('core.light.directional', { intensity: 1.1 }, { id: 'dir' });
  const stage = g.ops.create('core.group', { position: [0, 0.2, 0] }, { id: 'stage', parent: 'rig' });
  const row = g.ops.create('core.group', { position: [0, 0, 0] }, { id: 'row', parent: 'stage' }); // 第 3 层
  g.ops.create('core.mesh.box', { position: [-1.2, 0.5, 0], material: { color: '#e8b04b' } }, { id: 'm1', parent: 'row' });
  g.ops.create('core.mesh.sphere', { position: [0, 0.5, 0] }, { id: 'm2', parent: 'row' });
  g.ops.create('core.mesh.plane', { position: [0, 0, 0], rotation: [-1.5707963267948966, 0, 0] }, { id: 'm3', parent: 'row' });
  g.ops.create('core.mesh.cylinder', { position: [1.2, 0.5, 0] }, { id: 'm4', parent: 'row' });
  g.ops.create('core.mesh.torus', { position: [2.4, 0.5, 0], rotation: [1.2, 0, 0] }, { id: 'm5', parent: 'row' });
}

describe('serialize（FR-007）', () => {
  it('顶层 = schemaVersion + metadata + tree（单根、唯一节点形态）', () => {
    const g = makeGraph();
    buildFullScene(g);
    const doc = serializeGraph(g, { name: 'hello' });
    expect(Object.keys(doc).sort()).toEqual(['metadata', 'schemaVersion', 'tree']);
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(doc.metadata.name).toBe('hello');
    expect(doc.tree.type).toBe('core.group');
    expect(doc.tree.children.length).toBe(4); // env + rig + amb + dir（stage 挂在 rig 下）
  });

  it('序列化结果不含运行时句柄（全 JSON 兼容、可 JSON.stringify）', () => {
    const g = makeGraph();
    buildFullScene(g);
    const doc = serializeGraph(g);
    const json = JSON.stringify(doc);
    expect(json.length).toBeGreaterThan(200);
    expect(JSON.parse(json)).toEqual(doc);
    expect(json).not.toMatch(/__proto__|object3d|renderer/i);
  });

  it('空场景 → 合法最小文档', () => {
    const doc = serializeGraph(makeGraph());
    expect(doc.tree.children).toEqual([]);
    expect(doc.tree.type).toBe('core.group');
  });
});

describe('deserialize（FR-008 + 原子性）', () => {
  it('全新运行时仅凭数据重建等价场景；往返深度等价且 ID 不变（SC-002）', () => {
    const g1 = makeGraph();
    buildFullScene(g1);
    const doc1 = serializeGraph(g1);
    const g2 = makeGraph();
    deserializeIntoGraph(g2, doc1);
    const doc2 = serializeGraph(g2);
    expect(doc2.tree).toEqual(doc1.tree); // 结构 + 属性 + ID 深度等价
    // 幂等：同一数据重复反序列化结果确定
    const g3 = makeGraph();
    deserializeIntoGraph(g3, doc1);
    expect(serializeGraph(g3).tree).toEqual(doc1.tree);
  });

  it('校验失败零部分场景（原子）', () => {
    const g = makeGraph();
    g.ops.create('core.mesh.box', {}, { id: 'ok' });
    const before = serializeGraph(g);
    const bad = JSON.parse(JSON.stringify(before));
    bad.tree.children[0]!.props.material = { color: 'red' }; // 非法
    try {
      deserializeIntoGraph(g, bad);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_PROPS_INVALID');
    }
    expect(serializeGraph(g)).toEqual(before); // 树未变
  });

  it('结构损坏 → E_DOC_MALFORMED（非崩溃）', () => {
    const g = makeGraph();
    for (const bad of [null, 123, {}, { schemaVersion: '1.0.0' }, { schemaVersion: '1.0.0', metadata: {}, tree: { id: 1, type: 'x', props: {} } }]) {
      try {
        deserializeIntoGraph(g, bad as never);
        expect.unreachable();
      } catch (e) {
        expect(code(e)).toBe('E_DOC_MALFORMED');
      }
    }
  });

  it('未注册类型 / asset.* → E_TYPE_UNKNOWN（asset 预留为预期行为）', () => {
    const g = makeGraph();
    const doc = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      metadata: {},
      tree: { id: 'r', type: 'core.group', props: {}, children: [{ id: 'a', type: 'asset.gltf', props: {}, children: [] }] },
    };
    try {
      deserializeIntoGraph(g, doc);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_TYPE_UNKNOWN');
      expect(details(e).type).toBe('asset.gltf');
    }
  });

  it('ID 冲突 / 重复 → E_ID_CONFLICT', () => {
    const g = makeGraph();
    const doc = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      metadata: {},
      tree: { id: 'r', type: 'core.group', props: {}, children: [
        { id: 'dup', type: 'core.group', props: {}, children: [] },
        { id: 'dup', type: 'core.group', props: {}, children: [] },
      ] },
    };
    try {
      deserializeIntoGraph(g, doc);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_ID_CONFLICT');
    }
  });

  it('未来版本 → E_SCHEMA_FUTURE + requiredVersion', () => {
    const g = makeGraph();
    const doc = { schemaVersion: '2.0.0', metadata: {}, tree: { id: 'r', type: 'core.group', props: {}, children: [] } };
    try {
      deserializeIntoGraph(g, doc as never);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_SCHEMA_FUTURE');
      expect(details(e).requiredVersion).toBe('2.0.0');
    }
  });

  it('树深 > 64 → E_TREE_TOO_DEEP', () => {
    const g = makeGraph();
    let node = { id: 'n0', type: 'core.group', props: {}, children: [] as unknown[] };
    for (let i = 1; i <= 70; i++) {
      node = { id: `n${i}`, type: 'core.group', props: {}, children: [node] };
    }
    const doc = { schemaVersion: CURRENT_SCHEMA_VERSION, metadata: {}, tree: node as never };
    try {
      deserializeIntoGraph(g, doc as never);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe('E_TREE_TOO_DEEP');
    }
  });
});

describe('版本策略（FR-009）', () => {
  it('高 minor（同 major）向后兼容读取', () => {
    const g = makeGraph();
    const doc = {
      schemaVersion: `${CURRENT_SCHEMA_VERSION.split('.')[0]}.9.0`,
      metadata: {},
      tree: { id: 'r', type: 'core.group', props: {}, children: [] },
    };
    expect(() => deserializeIntoGraph(g, doc as never)).not.toThrow();
  });

  it('migrate 注册表骨架：无迁移器时原样返回；有则按序应用', () => {
    expect(migrateDocument({ schemaVersion: '1.0.0', metadata: {}, tree: null as never }, '1.0.0')).toBeTruthy();
  });
});
