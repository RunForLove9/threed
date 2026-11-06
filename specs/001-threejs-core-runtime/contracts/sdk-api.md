# Contract: @threed/sdk 公共 API（sdk-api）

**Status**: API 评审稿（宪法"API 评审"门禁对象） | 公共面唯一出口：`@threed/sdk`（`@threed/core` 不对外承诺）

## 0. 泄漏纪律（FR-012）

除 `escape()` 外，任何公共签名**不得出现 three 类型**；内部以 `unknown`/平台类型（`HTMLCanvasElement` 等）表达。逃生舱返回值类型标注 `THREE.*` 且文档声明"不承诺跨版本兼容"。

## 1. 运行时生命周期

```ts
import { createRuntime, type Runtime, type RuntimeOptions } from '@threed/sdk';

interface RuntimeOptions {
  canvas?: HTMLCanvasElement | OffscreenCanvas;  // 浏览器；缺省时创建并挂载到 parent
  parent?: HTMLElement;
  width?: number; height?: number;              // 无头/测试用
  // 渲染输出 v1 固定（无公共选项）：outputColorSpace=SRGB、toneMapping=none ——
  // 黄金图与 /render 等价性的确定性基线；其他色彩/色调需求经逃生舱 escape.renderer() 设置
  //（不承诺跨版本兼容）。未来如开放选项，须以 MINOR 加法 + 每模式黄金基线 + http 透传一并评审。
}

function createRuntime(options?: RuntimeOptions): Runtime;

interface Runtime {
  readonly registry: ComponentRegistry;
  readonly scene: SceneOperations;
  readonly events: EventBus;
  readonly metrics: MetricsSource;
  readonly escape: EscapeHatch;                 // 显式逃生舱（见 §5）
  start(): void; stop(): void;                  // 渲染循环
  resize(w: number, h: number): void;
  dispose(): void;                              // FR-016：清单化释放；之后任何调用 → 结构化错误
}
```

## 2. 场景操作（一切编辑落为数据变更，宪法 III）

```ts
interface SceneOperations {
  create(type: string, props?: JsonProps, options?: { id?: string; parent?: string }): InstanceRef;
  get(id: string): InstanceRef | null;
  update(id: string, props: Partial<JsonProps>): void;      // 浅合并，逐字段契约校验
  remove(id: string): void;
  move(id: string, parent: string, index?: number): void;
  serialize(): SceneDocument;
  deserialize(doc: SceneDocument): void;        // 原子：失败不产生部分场景
  activeCameraId(): string | null;              // 树序规则 + 运行时切换
  setActiveCamera(id: string): void;            // 运行时状态，不入文档
}

interface InstanceRef { readonly id: string; readonly type: string; readonly props: Readonly<JsonProps>; }
```

## 3. 组件注册表（FR-004；内置组件出厂预装，第三方同机制）

```ts
interface ComponentRegistry {
  register(def: ComponentDefinition, options?: { override?: boolean }): void;  // 重复默认拒绝
  has(type: string): boolean;
  list(): ReadonlyArray<{ type: string; category: string }>;
}
```

`ComponentDefinition` 形态见 [component-authoring.md](./component-authoring.md)。

## 4. 事件总线（FR-011/FR-021；无冒泡——仅命中实例派发 + 全局）

```ts
type InteractionEvent =
  | { type: 'pointerenter' | 'pointerleave' | 'pointerdown' | 'pointerup' | 'click';
      targetId: string;                    // 命中实例（最近 core.pickable 祖先）
      worldPoint: [number, number, number] | null;
      screenPoint: [number, number]; }
  | { type: 'wheel'; targetId: string | null; screenPoint: [number, number]; deltaY: number; }
  | { type: 'keydown' | 'keyup'; key: string; code: string; }        // 标准键值，无输入法/组合键语义
  | { type: 'camerachange'; cameraId: string };                      // 粗粒度节流（默认 ≤ 10 次/秒）

interface EventBus {
  subscribe(filter: { eventTypes?: string[]; componentId?: string; componentType?: string },
            handler: (e: InteractionEvent) => void): () => void;     // 返回退订函数；空 filter = 全局
}
```

v1 契约事件集：`pointerenter/leave/down/up/click`、`wheel`、`keydown/keyup`、`camerachange`；**不含逐帧 pointermove**（引入须增量兼容扩展）。全部事件可在无头环境由 Playwright 确定性模拟并纳入契约测试。

## 5. 度量与逃生舱

```ts
interface MetricsSource { snapshot(): MetricsSnapshot; }   // fps/drawCalls/triangles/geometries/textures/jsHeapBytes|null
interface EscapeHatch {
  /** ⚠ 不承诺跨 three 版本兼容；交出所有权的对象不随 dispose 释放（FR-016 所有权边界） */
  readonly THREE: typeof import('three');
  sceneObject(id: string): unknown;                        // 实例对应 three Object3D（只读约定）
  renderer(): unknown;
}
```

## 6. 结构化错误（跨环境一致形态）

```ts
interface ThreedError extends Error {
  code: 'E_PROPS_INVALID' | 'E_TYPE_UNKNOWN' | 'E_ID_CONFLICT' | 'E_ID_INVALID'
      | 'E_ENV_DUPLICATE' | 'E_CONTROL_DUPLICATE' | 'E_SCHEMA_FUTURE'
      | 'E_DOC_MALFORMED' | 'E_TREE_TOO_DEEP' | 'E_RUNTIME_DISPOSED' | ...;
  details?: Record<string, unknown>;       // 如 { instanceId, propPath } / { requiredVersion }
}
```

错误码全集与触发条件以 [data-model.md §5](../data-model.md) 为准；错误码本身是公共契约（语义化版本管理）。

## 7. 版本与发布

- 包版本：三包（core/sdk/http）同号统一治理（FR-017），CI 断言；公共 API 变更 → 语义化升版 + 契约测试与文档同步（宪法 V）。
- 类型：`.d.ts` 随包发布（FR-013）；ESM/CJS 双格式。
