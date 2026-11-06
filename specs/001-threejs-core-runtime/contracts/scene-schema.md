# Contract: SceneDocument 序列化格式（scene-schema）

**Status**: API 评审稿（宪法"API 评审"门禁对象） | **schemaVersion**: `1.0.0` | 机器可读真源：`@threed/core` zod 契约导出的 JSON Schema

## 1. 格式总则

- 传输/持久化形态：**UTF-8 JSON** 单文档；自包含、存储无关（文件/数据库/对象存储皆可原样保存恢复加载，FR-007）。
- 顶层仅三部分：`schemaVersion` + `metadata` + `tree`（单根组件实例树，唯一节点形态——spec 澄清 Q2）。
- 兼容承诺：MINOR 加法向后兼容；MAJOR 必须随附迁移器（详见 [data-model.md §4](../data-model.md)）。

## 2. 结构定义

```ts
interface SceneDocument {
  schemaVersion: string;          // "1.0.0" 起，语义化
  metadata: {
    name?: string;                // ≤ 256 字符
    created?: string;             // ISO 8601
  };
  tree: InstanceNode;             // 单根
}

interface InstanceNode {
  id: string;                     // 系统: ^i[A-Za-z0-9]{11}$；显式: ^[A-Za-z][A-Za-z0-9_-]{0,63}$；文档内唯一、往返不变
  type: string;                   // "core.*" 内置 | 第三方（禁 core./asset. 前缀）
  props: Record<string, JsonValue>;   // JSON 兼容值递归；按组件契约校验；缺省 = 契约默认值
  children?: InstanceNode[];      // 缺省 = []
}
```

## 3. 示例文档

```json
{
  "schemaVersion": "1.0.0",
  "metadata": { "name": "hello-threed", "created": "2026-11-05T12:00:00.000Z" },
  "tree": {
    "id": "iA1B2C3D4E5F",
    "type": "core.group",
    "props": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1], "visible": true },
    "children": [
      {
        "id": "ik8Fj2mNpQrS",
        "type": "core.environment",
        "props": { "background": "#101014", "fog": null }
      },
      {
        "id": "iZx9wYvUtSrQ",
        "type": "core.camera.perspective",
        "props": { "position": [0, 1.2, 5], "rotation": [0, 0, 0], "fov": 50, "near": 0.1, "far": 100 },
        "children": [
          { "id": "iqW1e3r5t7y9", "type": "core.control.orbit",
            "props": { "target": [0, 0.5, 0], "enableDamping": true, "dampingFactor": 0.08 } }
        ]
      },
      {
        "id": "iAbCdEfGhIjK",
        "type": "core.light.directional",
        "props": { "color": "#ffffff", "intensity": 1.1, "position": [5, 10, 7] }
      },
      {
        "id": "iMnOpQrStUvW",
        "type": "core.mesh.box",
        "props": {
          "position": [0, 0.5, 0], "rotation": [0, 0.6, 0], "scale": [1, 1, 1],
          "size": [1, 1, 1], "segments": [1, 1, 1],
          "material": { "color": "#e8b04b", "roughness": 0.4, "metalness": 0.2, "opacity": 1, "transparent": false, "wireframe": false }
        },
        "children": [
          { "id": "ixYz01234567", "type": "core.pickable", "props": { "enabled": true } }
        ]
      }
    ]
  }
}
```

## 4. 类型命名空间

| 命名空间 | 归属 | v1 状态 |
|----------|------|---------|
| `core.*` | 底座内置组件（12 种，字段表见 [data-model.md §2](../data-model.md)） | 已注册 |
| `asset.*` | 外部资产组件（`asset.gltf` 等，字段草案在 schema 规范登记） | **预留不注册**：出现即 `E_TYPE_UNKNOWN`（spec 澄清 Q2 的预期行为） |
| 其他（无保留前缀） | 第三方注册 | 注册时校验 |

## 5. 序列化/反序列化契约（对应 FR-007/008/009 + SC-002）

1. `serialize()` 产出本文档格式；**不写入**任何运行时句柄、内部缓存、GPU 资源标识。
2. `deserialize(doc)`：结构校验（`E_DOC_MALFORMED`）→ 版本判定（未来版本 `E_SCHEMA_FUTURE`）→ 逐节点注册表与 props 校验（错误码定位到 `instanceId` + `propPath`）→ 构建。**校验失败不产生部分场景**（原子性）。
3. 等价性判据（自动化往返测试）：`deepEqual(serialize(deserialize(serialize(doc))).tree, doc.tree)` 且 ID 不变；重复反序列化幂等。
4. 激活相机 = 树序第一个 `core.camera.perspective`（无文档级字段）；环境组件每文档至多一个。
