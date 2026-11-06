# Scene Schema

- **机器可读契约**：[`scene-schema.v1.0.json`](./scene-schema.v1.0.json)（由 `pnpm schema:export` 从 `@threed/core` zod 真源导出，随契约变更再生成）
- **人类可读契约**：`specs/001-threejs-core-runtime/contracts/scene-schema.md`（字段、示例、往返等价判据）
- **当前版本**：`1.0.0`（语义化；MINOR=加法兼容，MAJOR 必须随附迁移器）

## 类型命名空间

| 命名空间 | 归属 | 状态 |
|----------|------|------|
| `core.*` | 内置组件（10 种 + 交互 marker） | 已注册 |
| `asset.*` | 外部资产组件（`asset.gltf` 等） | **预留不注册**（spec 澄清 Q2）：v1 数据中出现该族类型按 `E_TYPE_UNKNOWN` 报错（预期行为）；字段草案见下 |
| 其他 | 第三方注册 | 注册时校验（禁用保留前缀） |

## `asset.*` 字段草案（预留，v1 不实现）

```jsonc
// asset.gltf（草案——正式启用时随 MINOR 版本与加载能力一并评审）
{
  "src": "string（URI，启用时定义允许的协议与解析规则）",
  "scale": "[number, number, number]?",
  "animations": "{ [name]: { autoplay: bool, loop: bool } }?"
}
```
