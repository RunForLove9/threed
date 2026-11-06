# Data Model: Three.js 核心运行时底座（Phase 1）

**Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md) | **Schema 契约**: [contracts/scene-schema.md](./contracts/scene-schema.md)

真源规则：SceneDocument 的结构真源是 `@threed/core` 内以 zod 声明的契约（可导出 JSON Schema）；本文件是设计态描述，字段级机器可读定义以导出的 JSON Schema 为准。

---

## 1. 核心数据实体

### 1.1 SceneDocument（场景文档 · 顶层可序列化单元）

| 字段 | 类型 | 必填 | 规则 |
|------|------|------|------|
| `schemaVersion` | string | ✔ | 语义化版本 `"1.0.0"` 起；兼容策略见 §4 |
| `metadata` | object | ✔ | `name?: string`（≤256 字符）；`created?: string`（ISO 8601）。仅元数据，不参与渲染语义 |
| `tree` | InstanceNode | ✔ | 单根组件实例树（唯一节点形态，无并列全局设置块——spec 澄清 Q2） |

**不变式**: 自包含、存储无关——文档内不含绝对路径、环境引用、运行时句柄；任一合法文档可被任一运行时仅凭数据重建（FR-007/008）。

### 1.2 InstanceNode（组件实例 · 树节点）

| 字段 | 类型 | 必填 | 规则 |
|------|------|------|------|
| `id` | string | ✔ | 文档内唯一。系统分配：`^i[A-Za-z0-9]{11}$`；显式指定：`^[A-Za-z][A-Za-z0-9_-]{0,63}$`。往返原样保留（FR-020） |
| `type` | string | ✔ | 点分命名空间。`core.*` 内置保留；`asset.*` 预留不注册（spec 澄清 Q2）；第三方禁用两前缀 |
| `props` | object | ✔ | JSON 兼容值递归（null/bool/number/string/array/object）；按组件契约校验，缺省字段取契约默认值（spec 澄清 Q3） |
| `children` | InstanceNode[] | 可选 | 无则视为 `[]`。**树约束**：无环（构造上不可能成环，反序列化仍检测）；深度软上限 64（超出拒绝，防深递归栈风险） |

**父子变换语义**: 实例的空间变换（position/rotation/scale）是其自身 props 的一部分，作用于子树（three `Object3D` 层级语义的直接对应）。

### 1.3 ComponentDefinition（组件定义 · 注册表条目）

| 组成 | 说明 |
|------|------|
| `type` | 唯一类型标识（命名空间规则同上） |
| `propsContract` | zod 契约：字段类型 + 默认值；机器可读形态 = JSON Schema（导出物） |
| `mount(instance) → MountResult` | 由实例数据构建渲染子树（返回 three 对象 + 需跟踪释放的资源清单） |
| `update(prev, next)` | props 变更的增量应用（未提供则退化为 remount） |
| `dispose(mountResult)` | 释放 mount 产生的资源 |
| `category` | `primitive` / `group` / `light` / `camera` / `environment` / `interaction`（用于文档与测试分组） |

**不变式**: 内置组件与第三方组件走**同一注册机制与同一待遇**（宪法 IV，dogfooding）；组件必须可脱离具体场景独立测试（含渲染冒烟）。

### 1.4 ComponentRegistry（组件注册表）

- 映射：`type → ComponentDefinition`；进程内单例（每 Runtime 独立注册表实例，内置组件预装）。
- 注册规则：`core.`/`asset.` 前缀拒绝第三方注册；重复 type 默认拒绝，显式 `override: true` 才允许覆盖（spec 边界场景）。

### 1.5 Runtime（运行时）

绑定画布（浏览器）或无头表面（Playwright 页面内的 canvas），持有：渲染循环、注册表实例、事件总线、度量采样器、资源跟踪表（dispose 清单）。生命周期见 §3.1。**渲染输出 v1 固定**：outputColorSpace=SRGB、toneMapping=none，不提供公共选项——这是黄金图与 `/render` 等价性的确定性基线；高级色彩需求走逃生舱（research R4）。

### 1.6 交互声明（marker 组件模式）

交互不引入第二种节点形态，一律是**挂在目标实例子级的叶子 marker 组件**：

| 类型 | 挂载位置 | props 概要 |
|------|----------|-----------|
| `core.pickable` | 可拾取目标实例的子级 | `enabled: bool`（默认 true）；命中解析 = 自命中对象沿父链上溯最近 `core.pickable` 祖先实例 |
| `core.control.orbit` | 激活相机实例的子级 | `target:[3]`（默认 `[0,0,0]`）、`minDistance?: number`（默认不设）、`maxDistance?: number`（默认不设）、`enableDamping: bool`（默认 true）、`dampingFactor: number`（默认 0.08）。**同一运行时至多一个**，重复挂载报错（spec 边界场景） |

事件订阅是运行时侧 API（回调不入文档——函数不是数据，宪法 III），契约见 [contracts/sdk-api.md](./contracts/sdk-api.md)。

### 1.7 MetricsSnapshot（性能度量快照 · 只读）

`{ fps: number|null, drawCalls: number, triangles: number, geometries: number, textures: number, jsHeapBytes: number|null }`——jsHeap 仅在环境提供（`performance.memory`）时有值，否则 null（不伪造，FR-003）。

## 2. 内置组件目录 v1（12 种 · FR-006）

| type | category | props 要点（默认值） |
|------|----------|---------------------|
| `core.group` | group | `position:[0,0,0]`、`rotation:[0,0,0]`（弧度 XYZ）、`scale:[1,1,1]`、`visible:true` |
| `core.camera.perspective` | camera | `position:[0,0,5]`、`rotation:[0,0,0]`、`fov:50`、`near:0.1`、`far:100` |
| `core.mesh.box` | primitive | 变换同 group；`size:[1,1,1]`、`segments:[1,1,1]`；`material`（见下） |
| `core.mesh.sphere` | primitive | `radius:0.5`、`widthSegments:32`、`heightSegments:16`；`material` |
| `core.mesh.plane` | primitive | `size:[1,1]`；`material` |
| `core.mesh.cylinder` | primitive | `radiusTop:0.5`、`radiusBottom:0.5`、`height:1`、`radialSegments:32`；`material` |
| `core.mesh.torus` | primitive | `radius:0.5`、`tube:0.2`、`radialSegments:16`、`tubularSegments:48`；`material` |
| `core.light.ambient` | light | `color:"#ffffff"`、`intensity:1` |
| `core.light.directional` | light | `color:"#ffffff"`、`intensity:1`、`position:[5,10,7]` |
| `core.environment` | environment | `background:"#101014" \| null`、`fog: { color, near, far } \| null`；**每文档至多一个**（校验拒绝第二个） |
| `core.pickable` | interaction | `enabled:true` |
| `core.control.orbit` | interaction | 见 §1.6 |

**material 子对象**（mesh 共有，属 props 一部分）: `{ color:"#9aa4b2", roughness:0.55, metalness:0.1, opacity:1, transparent:false, wireframe:false }`。颜色统一 hex 字符串 `"#rrggbb"`（人读/可 diff，three `Color.setStyle` 直映）。

**预留不注册**（spec 澄清 Q2）: `asset.*` 命名空间（如 `asset.gltf`）——schema 规范中登记命名空间与字段草案；v1 运行时遇到按"未注册类型"结构化报错（预期行为）。

**激活相机规则**: 文档不设额外字段——**树序第一个 `core.camera.perspective` 实例**为激活相机；运行时可用 API 切换当前相机（运行时状态，不入文档；重新序列化仍按树序默认）。规则依据：文档顶层仅 版本+元数据+树（spec 澄清 Q2）。

## 3. 状态与生命周期

### 3.1 Runtime

`created → running → disposed`（终态）。`dispose()` 必须释放：注册的 GPU 资源（资源跟踪表内 geometry/material/texture）、渲染循环与 rAF、事件监听、three renderer/controls；**逃生舱交出所有权的对象除外**（所有权边界写入 API 文档，FR-016）。disposed 后任何公共调用返回结构化错误（不静默）。

### 3.2 组件实例（文档视角）

`created → (mounted → updated)* → removed`——文档操作（增/删/改 props/移动）即数据变更；运行时把它们投影为 mount/update/unmount。**一切编辑必经公共 API 落为数据变更**（宪法 III：序列化器只读数据即可重建，不存在只有运行时知道的状态）。

### 3.3 SceneDocument 版本迁移

`deserialize(doc)`: 读 `schemaVersion` → 同 major 且 ≤ 当前 minor：直接读取（向后兼容承诺，FR-009）→ 高于当前：报 `E_SCHEMA_FUTURE`（指明所需最低版本，spec 边界场景）→ 命中已登记的迁移动作则先转换再读取（迁移器骨架 v1 就位，首个真实迁移器随首个格式演进交付）。

## 4. Schema 版本策略

- `schemaVersion` 与 SDK 包版本**独立演化**（spec 假设）。
- PATCH：文档/描述修正；MINOR：**加法**（新组件类型、新可选字段、新枚举值）——旧运行时读新 minor 数据时报 `E_SCHEMA_FUTURE` 之外的字段忽略策略不承诺，读取器按"认识才解释"原则；MAJOR：不兼容变更，**必须**随版本发布迁移器（`migrate(doc): DocVersion → DocVersion`）。
- 黄金规则：**同一数据 + 同一 schema 版本 → 反序列化结果确定（幂等）**；往返（serialize∘deserialize）不丢失、不改写用户数据（ID、props 原样）。

## 5. 校验规则汇总（结构化错误定位）

| 规则 | 错误码（草案） | 定位信息 |
|------|---------------|----------|
| props 类型不符/越界/多余字段 | `E_PROPS_INVALID` | `instanceId` + `propPath`（如 `material.color`） |
| 未注册类型 / `asset.*` 预留类型 | `E_TYPE_UNKNOWN` | `instanceId` + `type` |
| ID 重复 / 非法格式 | `E_ID_CONFLICT` / `E_ID_INVALID` | `id` |
| 第二个 `core.environment` | `E_ENV_DUPLICATE` | `instanceId` |
| 第二个 `core.control.orbit` | `E_CONTROL_DUPLICATE` | `instanceId` |
| schemaVersion 高于运行时 | `E_SCHEMA_FUTURE` | `requiredVersion` |
| 文档结构损坏/篡改 | `E_DOC_MALFORMED` | JSON 路径 |
| 树深超限 | `E_TREE_TOO_DEEP` | `instanceId` + `depth` |

错误对象统一形态：`{ code, message, details? }`——浏览器/Node 两侧一致，测试断言以此为准。
