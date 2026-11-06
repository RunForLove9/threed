// T031：SceneDocument 结构真源（zod）——契约 contracts/scene-schema.md 的机器可读形态。
// JSON Schema 导出：z.toJSONSchema(sceneDocumentSchema)（scripts/export-json-schema.mjs → docs/schema/）。
import { z } from 'zod';

const SEMVER = /^\d+\.\d+\.\d+$/;

export interface JsonRecord {
  [k: string]: unknown;
}

export interface DocumentNode {
  id: string;
  type: string;
  props: JsonRecord;
  children: DocumentNode[];
}

// 递归节点（结构级校验；props 语义在反序列化阶段经组件契约逐节点校验——两级校验，原子性前提）
const documentNode: z.ZodType<DocumentNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(64),
    type: z.string().min(1),
    props: z.record(z.string(), z.unknown()).default({}),
    children: z.array(documentNode).default([]),
  }),
);

export interface SceneDocument {
  schemaVersion: string;
  metadata: { name?: string; created?: string };
  tree: DocumentNode;
}

export const sceneDocumentSchema: z.ZodType<SceneDocument> = z.object({
  schemaVersion: z.string().regex(SEMVER, 'schemaVersion 须为语义化版本 X.Y.Z'),
  metadata: z
    .object({
      name: z.string().max(256).optional(),
      created: z.string().optional(),
    })
    .default({}),
  tree: documentNode,
});

/** 机器可读契约导出（docs/schema/scene-schema.v1.json 的来源——T031）。 */
export function documentJsonSchema(): unknown {
  return z.toJSONSchema(sceneDocumentSchema);
}
