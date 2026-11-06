// T032：序列化/反序列化（FR-007/008 + contracts/scene-schema.md §5）
// 反序列化三段式：结构校验（zod）→ 版本判定/迁移 → 纯树校验（类型/props/ID/单例/深度）→ 原子提交。
import { ThreedError } from '../errors';
import { parseProps } from '../component/registry';
import type { SceneGraph } from '../scene/scene-graph';
import { sceneDocumentSchema, type SceneDocument, type DocumentNode } from './document';
import { CURRENT_SCHEMA_VERSION, assertReadableVersion, migrateDocument } from './versioning';

export { CURRENT_SCHEMA_VERSION, migrateDocument, assertReadableVersion };

export function serializeGraph(g: SceneGraph, metadata?: { name?: string; created?: string }): SceneDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: { ...(metadata ?? {}) },
    tree: g.docTree(),
  };
}

/** 纯校验（零变更）：任何失败在提交前抛出——原子性保证（contracts/scene-schema.md §5.2）。 */
function validateTree(g: SceneGraph, tree: DocumentNode): void {
  const ids = new Set<string>([tree.id]);
  const singletonSeen = new Set<string>();
  const SINGLETONS = ['core.environment', 'core.control.orbit'];
  const walk = (node: DocumentNode, depth: number): void => {
    if (depth > 63) {
      throw new ThreedError('E_TREE_TOO_DEEP', `树深超过 64`, { instanceId: node.id, depth: depth + 1 });
    }
    if (SINGLETONS.includes(node.type)) {
      if (singletonSeen.has(node.type)) {
        const code2 = node.type === 'core.environment' ? 'E_ENV_DUPLICATE' : 'E_CONTROL_DUPLICATE';
        throw new ThreedError(code2, `${node.type} 每文档至多一个`, { instanceId: node.id });
      }
      singletonSeen.add(node.type);
    }
    if (depth > 0) {
      // 根节点 id 为结构性 'root'；子节点必须是已注册类型（含 props 契约校验）
      const def = g.registry.get(node.type);
      if (!def) {
        throw new ThreedError('E_TYPE_UNKNOWN', `未注册的组件类型: ${node.type}`, { instanceId: node.id, type: node.type });
      }
      // parseProps（含默认值填充与值域校验；E_PROPS_INVALID 定位 instanceId+propPath）
      parseProps(def, node.props ?? {}, node.id);
    }
    for (const c of node.children) {
      if (ids.has(c.id)) throw new ThreedError('E_ID_CONFLICT', `实例 ID 重复: ${c.id}`, { id: c.id });
      ids.add(c.id);
      walk(c, depth + 1);
    }
  };
  walk(tree, 0);
}

export function deserializeIntoGraph(g: SceneGraph, raw: unknown): void {
  // 1) 结构校验
  const parsed = sceneDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const path = issue.path.map(String).join('.');
    throw new ThreedError('E_DOC_MALFORMED', `文档结构校验失败: ${issue.message}`, { path: path || '(root)' });
  }
  // 2) 版本：先迁移（若有迁移器），再判定可读性
  const doc = migrateDocument(parsed.data as SceneDocument);
  assertReadableVersion(doc.schemaVersion);
  // 3) 纯树校验（原子性：失败零变更）
  validateTree(g, doc.tree);
  // 4) 提交
  g.replaceAll(doc.tree);
}
