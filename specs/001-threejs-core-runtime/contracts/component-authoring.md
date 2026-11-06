# Contract: 组件编写契约（component-authoring）

**Status**: API 评审稿 | 适用对象：内置组件作者与第三方组件作者（同一机制，宪法 IV）

## 1. 定义形态

```ts
import { defineComponent } from '@threed/sdk';
import { z } from 'zod';

const MyBox = defineComponent({
  type: 'mylib.box',                       // 禁用 core./asset. 前缀；点分命名空间
  category: 'primitive',                   // primitive|group|light|camera|environment|interaction
  props: z.object({                        // props 契约 = zod schema（字段类型 + 默认值）
    size: z.array(z.number()).length(3).default([1, 1, 1]),
    material: z.object({ color: z.string().default('#9aa4b2') }).default({}),
  }),
  mount(ctx) { /* 实例数据 → three 子树 + 资源清单 */ },
  update(ctx, prevProps) { /* 增量；可省略（退化为 remount） */ },
  dispose(ctx) { /* 释放 mount 产生的资源 */ },
});
runtime.registry.register(MyBox);          // 注册后方可被场景引用（FR-004）
```

## 2. 契约规则（MUST）

1. **props 值域**：JSON 兼容值递归（null/bool/number/string/array/object）；契约声明字段类型与默认值；函数/类实例/循环引用在**注册与写入时拒绝**（spec 澄清 Q3）。颜色 = `"#rrggbb"`，向量/颜色分量 = number 数组。
2. **mount 纯数据进、渲染树出**：输入只有 `instance.props` 与上下文（注册表/资源跟踪），MUST NOT 读取隐藏运行时状态——保证"仅凭数据可重建"（宪法 III）。
3. **资源记账**：mount 创建的 geometry/material/texture MUST 经 `ctx.track()` 登记，由 Runtime.dispose 统一释放；经逃生舱显式交出所有权者除外（FR-016）。
4. **update 语义**：仅收到变更 props 的浅合并结果；实现 MUST 保持幂等（同一 props 反复 update 结果一致）；未提供 update 则整体 remount。
5. **dispose 幂等**：重复调用不抛错。
6. **命名空间**：`core.*`/`asset.*` 保留；重复注册默认拒绝，显式 `override: true` 才允许（spec 边界场景）。

## 3. marker 组件（interaction 类别）

`core.pickable`、`core.control.orbit` 等交互组件是**叶子 marker**：不产出可见几何，语义由挂载位置（父实例）决定（data-model §1.6）。第三方可注册自定义 marker（如未来 `mylib.draggable`），同样遵守"props 全 JSON、可序列化往返"。

## 4. 组件级测试义务（宪法 IV/V，进 tasks.md 门禁）

每个组件（含第三方示例）必须随定义交付：

1. **孤立契约测试**：合法/非法 props 用例（错误码 + `propPath` 断言）、默认值填充断言；
2. **渲染冒烟**：在 Playwright 无头环境单独 mount → 首帧截图非空、`renderer.info` 计数合理；
3. **往返测试**：含该组件的文档 serialize → deserialize 深度等价（SC-002 矩阵的组成部分）。

内置 12 组件逐一套用同一测试矩阵（golden 基准图随 `tests/golden/` 归档，容差随图记录）。
