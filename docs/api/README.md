# @threed/sdk 公共 API

> 契约真源：`specs/001-threejs-core-runtime/contracts/sdk-api.md`；机器可读 schema：[docs/schema](../schema/README.md)。
> 本文档由 SC-006 审计覆盖：每个值导出必须有文档条目且至少被一条测试引用（`pnpm test` 内置审计用例）。

## 运行时

| 导出 | 说明 |
|------|------|
| `createRuntime` | 创建运行时（浏览器画布或无头表面）。同一套调用方式两个环境一致（FR-002）。渲染输出 v1 固定 SRGB + 无色调映射（确定性基线，无公共选项） |
| `SDK_VERSION` | SDK 包版本（三包同号统一治理，FR-017） |

## 组件体系

| 导出 | 说明 |
|------|------|
| `defineComponent` | 定义组件（类型标识 + props 契约 + mount/update/dispose 生命周期）。详见 [component-authoring 契约](../../specs/001-threejs-core-runtime/contracts/component-authoring.md) |
| `BUILTIN_TYPES` | v1 内置 12 种组件类型清单（group/camera/mesh×5/light×2/environment/pickable/orbit） |

## 场景与序列化

| 导出 | 说明 |
|------|------|
| `CURRENT_SCHEMA_VERSION` | SceneDocument schema 版本（独立于包版本演化；MINOR=加法兼容，MAJOR 必须随附迁移器——FR-009） |

经 `runtime.scene`：`create/get/update/remove/move/activeCameraId/setActiveCamera/serialize/deserialize`（原子：失败零部分场景）。

## 错误

| 导出 | 说明 |
|------|------|
| `ThreedError` | 结构化错误：`{ code, message, details? }`，details 定位 `instanceId`/`propPath` 等 |
| `isThreedError` | 类型守卫 |
| `ERROR_CODES` | 错误码全集（公共契约，语义化演进） |

## 逃生舱（FR-012）与所有权边界

`runtime.escape`：`escape.THREE`（内核模块）、`escape.renderer()`（借用视图）、`escape.sceneObject(id)`（实例 Object3D，只读约定）。

- ⚠ **不承诺跨 three 版本兼容**；升级 three 后经逃生舱写的代码可能需要调整。
- **所有权边界（FR-016）**：v1 逃生舱只提供借用视图、不转移所有权——运行时 `dispose()` 仍会释放渲染器；未来若增加"交出所有权"的 API，交出对象将不随 dispose 释放并在文档显式标注。

## 事件（v1 契约集）

`pointerenter/leave/down/up/click`、`wheel`、`keydown/keyup`（标准键值）、`camerachange`（节流 ≤10/s）。无冒泡：仅命中实例派发 + 全局/按 ID/按类型订阅（`runtime.events.subscribe`）。逐帧 `pointermove` 不在 v1 契约。
