# Implementation Plan: Three.js 核心运行时底座

**Branch**: `001-threejs-core-runtime` | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-threejs-core-runtime/spec.md`

## Summary

以 three.js **0.186.1**（集中锁定）为唯一渲染内核，构建 pnpm 多包 monorepo：`@threed/core`（运行时内核：场景树/组件注册表/交互/可序列化 schema/性能度量）、`@threed/sdk`（公共 API 门面 + 类型 + 逃生舱）、`@threed/http`（node:http + Playwright 无头渲染骨架）、`apps/demo`（Vite 实时渲染演示）。场景 = 带稳定实例 ID 的 JSON 组件树（含环境/交互组件），序列化自包含、存储无关、带 schema 版本号；无头验证走 Playwright + SwiftShader 软件渲染，黄金图带容差比对。全部公共 API 契约测试先行（TDD），版本唯一性与文档-测试覆盖由 CI 门禁强制。

## Technical Context

**Language/Version**: TypeScript 5.x（ESM 优先，dual format 发布）；Node ≥ 22（无头/CI/服务端）；浏览器现代 evergreen（桌面 + 移动）。

**Primary Dependencies**:
- 运行时：`three@0.186.1`（**exact 锁定**，经 pnpm `catalog:` 唯一声明——FR-001）；`zod@4`（props 契约与 SceneDocument 校验，可导出 JSON Schema——依赖论证见 research.md R3）
- `@threed/http`：`playwright`（无头渲染驱动，Chromium + SwiftShader——R1）
- 构建与测试（devDeps）：`typescript`、`vitest`、`tsup`、`@playwright/test`、`vite`（仅 demo）

**Storage**: N/A（v1 序列化产物为存储无关 JSON，保存/恢复/加载的介质选型为后续独立功能——spec Assumptions）。

**Testing**: `vitest`（单元 + 契约）；`@playwright/test`（渲染冒烟、黄金图比对 `toHaveScreenshot` 带容差、指针/键盘事件模拟、http 端到端）。TDD 强制：先红后绿（宪法 V）。

**Target Platform**: 现代浏览器（WebGL2）+ Node ≥ 22 无头（Playwright Chromium + SwiftShader 软件渲染；SwiftShader 标志位在实现首任务中验证——R1）。

**Project Type**: 多包库（library monorepo）+ demo 应用 + 骨架级 http 服务。

**Performance Goals**: 度量内建（FPS / draw call / 三角形 / 内存，FR-003）可实时读取；具体预算数值按宪法延后至首版渲染管线落地量化写回。

**Constraints**: 仓库内 three.js 解析版本唯一（CI 断言）；同一套 SDK 调用方式在浏览器与无头环境一致；渲染输出确定性优先（黄金图可在 CI 稳定复现）；依赖最小化（新增运行时依赖逐项论证）。

**Scale/Scope**: 5 个用户故事 / 21 条 FR / 7 条 SC；v1 内置组件 12 种（见 data-model.md）；无业务接入。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 宪法条款 | 判定 | 依据 |
|-----------|------|------|
| I. 平台优先（版本化 API/SDK、无业务概念、独立运行） | **PASS** | `@threed/sdk` 为唯一公共面，类型随包发布；contracts/ 即 API 评审产物；demo + CI 证明独立运行/测试/演示（SC-004） |
| II. Three.js 单一渲染内核 | **PASS** | `three@0.186.1` exact + pnpm catalog 唯一声明；CI 版本唯一性断言（FR-001）；逃生舱显式标注 `runtime.escape`（FR-012），其余 API 不泄漏内核对象 |
| III. 数据驱动与可序列化 | **PASS** | SceneDocument = 版本 + 元数据 + 组件树（唯一节点形态）；往返等价与幂等为契约测试；schema 语义化版本 + 迁移骨架（FR-007/008/009） |
| IV. 可组合组件体系 | **PASS** | 注册表单一资产，内置组件与第三方组件同一注册机制（dogfooding）；props 契约（JSON 值域）+ 每组件独立渲染冒烟（FR-004/006） |
| V. 契约测试与测试先行 | **PASS** | tasks 阶段强制 Red-Green-Refactor；contracts/ 与测试一一对应；渲染冒烟 + 黄金图容差比对（FR-014）；文档-测试覆盖审计（SC-006） |
| 技术约束：TypeScript / 浏览器+无头 / 依赖最小化 / 性能度量 | **PASS** | TS 全量；无头 = Playwright；新增运行时依赖共 2 项（zod、playwright[仅 http]）逐项论证（research.md R1/R3）；度量内建（FR-003） |
| 开发工作流：规格驱动 / API 评审 / 质量门禁 / 文档门禁 | **PASS** | 本 plan + contracts/ 构成 API 评审材料；CI 门禁 = 类型检查 + 单元 + 契约 + 渲染回归；公共 API 变更同步 docs/ 与示例 |

**Post-Phase-1 复检（2026-11-05）**: 设计产物（research.md / data-model.md / contracts/ / quickstart.md）生成后逐条复查，无违宪项；无豁免申请，Complexity Tracking 留空。

## Project Structure

### Documentation (this feature)

```text
specs/001-threejs-core-runtime/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── scene-schema.md
│   ├── sdk-api.md
│   ├── component-authoring.md
│   └── http-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
pnpm-workspace.yaml          # workspace 定义 + catalog: three@0.186.1（FR-001 唯一版本声明处）
package.json                 # 根脚本（build/test/test:render/dev/http:serve/check:three-version）
tsconfig.base.json           # 共享 TS 配置（strict）
docs/                        # 使用文档（文档门禁对象，按公共 API 面组织）
packages/
├── core/                    # @threed/core —— 运行时内核（不直接对外）
│   ├── src/
│   │   ├── runtime/         # createRuntime / 渲染循环 / dispose 资源回收 / 逃生舱
│   │   ├── scene/           # 场景树：按 ID 定点 CRUD、树序规则（相机激活等）
│   │   ├── component/       # 注册表、defineComponent 生命周期、12 个内置组件
│   │   ├── interaction/     # 拾取（Raycaster）、事件总线（订阅过滤/无冒泡）、orbit 控制
│   │   ├── schema/          # SceneDocument 序列化/反序列化/校验/版本迁移骨架
│   │   ├── metrics/         # FPS / draw calls / 三角形 / 内存（renderer.info + heap）
│   │   └── errors/          # 结构化错误码（E_*，含 instanceId/propPath 定位）
│   └── test/                # 单元 + 契约：往返等价、幂等、props 拒绝、ID 规则
├── sdk/                     # @threed/sdk —— 公共 API 门面（re-export + 类型 + 文档锚点）
│   ├── src/                 # index.ts（公共面唯一出口；逃生舱显式命名导出）
│   └── test/                # 公共 API 契约测试（面覆盖审计的锚点）
├── http/                    # @threed/http —— 无头渲染服务骨架（node:http 零框架）
│   ├── src/                 # /health、/render（Playwright 截图）、结构化错误、体积上限
│   └── test/                # 端到端：健康检查、渲染往返、非法/超限输入
apps/
└── demo/                    # 本地一键启动实时渲染 Demo（Vite；覆盖 Story1–4 主链路）
tests/                       # 跨包 Playwright：渲染冒烟、黄金图比对、交互模拟
└── golden/                  # 基准图（按平台/组件归档，容差随图记录）
```

**Structure Decision**: 采用 pnpm workspaces 单仓多包（`packages/core|sdk|http` + `apps/demo`），依赖版本经 root `pnpm-workspace.yaml` 的 `catalog:` 集中声明——这是 FR-001"唯一依赖声明处"与 FR-017"三包版本统一治理"的结构保障；`sdk` 仅 re-export `core`，保证公共面收敛于单一出口；跨包渲染回归与黄金图置于根 `tests/`，因为它验证的是"整仓同一版本内核"的行为而非单包。
