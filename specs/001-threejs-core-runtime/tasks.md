---
description: "Task list for feature implementation"
---

# Tasks: Three.js 核心运行时底座

**Input**: Design documents from `/specs/001-threejs-core-runtime/`（plan.md / spec.md / research.md / data-model.md / contracts/ / quickstart.md）

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: **强制 TDD（宪法 V + 用户指令）**——每个故事阶段的第一组任务永远是"先写失败测试（Red）"，确认失败后才允许实现任务（Green）；门禁/工具类任务同样先写"必须失败"的断言用例再实现。每任务或逻辑组完成后 commit。

**Organization**: 按用户故事分阶段（P1→P5 分层递进），故事间为分层依赖（见 Dependencies），阶段内部按 Red→Green→基线 顺序执行。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: 所属用户故事（US1–US5）
- 所有路径相对仓库根（结构见 plan.md Project Structure）

## Path Conventions

- 多包 monorepo：`packages/core|sdk|http`、`apps/demo`、根 `tests/`（跨包渲染回归）、`scripts/`（门禁脚本）、`docs/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: monorepo 骨架与工具链就位

- [x] T001 创建 workspace 骨架：`pnpm-workspace.yaml`（packages/apps + **`catalog:` 中 `three@0.186.1` exact 唯一声明**，FR-001）、根 `package.json`（engines node>=22, pnpm>=9）、`tsconfig.base.json`（strict）、目录树 `packages/core|sdk|http/src`、`apps/demo`、`tests/golden`、`scripts/`、`docs/`
- [x] T002 [P] 三包 + demo 的 `package.json`：统一版本 `0.1.0`、名称 `@threed/core|sdk|http`、依赖经 `"three": "catalog:"` 引用、`@threed/sdk` 声明 `dependencies: {"@threed/core": "workspace:"}`
- [x] T003 [P] 工具链配置：`vitest.workspace.ts`、各包 `tsup.config.ts`（ESM/CJS + dts）、根 `playwright.config.ts`、根 scripts（`build/test/test:render/typecheck/dev/http:serve/check:three-version/check:pkg-versions`）
- [x] T004 [P] `.gitignore`（node_modules/dist/test-results）、根 `README.md` 骨架、`docs/` 目录骨架（api/schema/quickstart 占位）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 宪法门禁、R1 探针、黄金图基线设施、纯函数基础件——**所有用户故事的前置**

- [x] T005 **R1 探针验证**：先写失败探针用例 `tests/probe/webgl2-probe.spec.ts`（创建 WebGL2 context → 渲染单三角 → readback 断言非黑像素），在 Playwright Chromium 下逐一验证候选启动参数（`--use-angle=swiftshader` / `--enable-unsafe-swiftshader` 组合），把可用组合固化进 `playwright.config.ts` 并将结论记录回 `specs/001-threejs-core-runtime/research.md` R1（research.md R1 遗留的 Verification task）
- [x] T006 **宪法门禁：three 版本唯一**：先写失败用例（fixture：workspace 内注入第二版本 `three@0.187.0` 时脚本必须退出非 0），再实现 `scripts/check-three-version.mjs`（解析 pnpm store 断言全仓只解析出一个 three 版本且为 0.186.1），接入根 script `check:three-version`（FR-001/SC-003）
- [x] T007 [P] 结构化错误体系（TDD）：先写失败单测 `packages/core/test/errors.test.ts`（每个错误码 → 错误对象形态 `{code,message,details?}` 与定位字段：`E_PROPS_INVALID` 带 `instanceId`+`propPath`、`E_SCHEMA_FUTURE` 带 `requiredVersion` 等，全集见 data-model.md §5），再实现 `packages/core/src/errors/index.ts`
- [x] T008 [P] 实例 ID 生成器（TDD，research R6）：先写失败单测 `packages/core/test/id.test.ts`（系统 ID 匹配 `^i[A-Za-z0-9]{11}$`、显式 ID 匹配 `^[A-Za-z][A-Za-z0-9_-]{0,63}$`、文档内查重与冲突重生成、非法格式拒绝 `E_ID_INVALID`），再实现 `packages/core/src/schema/id.ts`
- [x] T009 [P] JSON 值域守卫（TDD，spec 澄清 Q3）：先写失败单测（函数/类实例/循环引用/Symbol 必须被拒；null/bool/number/string/array/object 递归通过），再实现 `packages/core/src/component/json-value.ts`（基于 zod 的 JsonValue 契约 + 拒绝报告含 propPath）
- [x] T010 **黄金图基线设施**：实现 `tests/golden/harness.ts`（截图 helper：固定相机/尺寸、显式 colorSpace/toneMapping、容差随基线图记录于 `tests/golden/tolerances.json`）+ 空白页 dry-run 用例验证 harness 本身可用（作为后续所有基线的统一入口）

**Checkpoint**: 探针绿、门禁脚本可用、基础件单测绿——用户故事可以开始

---

## Phase 3: User Story 1 - 基线版本锁定与最小场景运行时 (Priority: P1) 🎯 MVP

**Goal**: createRuntime→空场景首帧→度量→dispose 全链路（浏览器+无头），版本唯一可验证
**Independent Test**: 无头环境 boot 空场景 → 首帧黄金图比对 → dispose 无残留；`pnpm check:three-version` 通过

### Tests for User Story 1 (Red 先行)

- [x] T011 [US1] 失败测试先行：`packages/core/test/runtime.contract.test.ts`（vitest，Node 侧：options 解析、Runtime 接口形态、dispose 后调用返回 `E_RUNTIME_DISPOSED`、escape.THREE 可用且渲染器对象不泄漏进其他公共签名）
- [x] T012 [US1] 失败测试先行：`tests/render/us1-boot.spec.ts`（Playwright：首帧非空、`metrics.snapshot()` 返回 `{fps,drawCalls,triangles,geometries,textures,jsHeapBytes|null}` 全字段、resize 生效、dispose 后 canvas 释放）

### Implementation for User Story 1

- [x] T013 [US1] `packages/core/src/runtime/create-runtime.ts`：createRuntime(options)、渲染循环 start/stop、resize、**显式设定** outputColorSpace=srgb + toneMapping=none 并写入文档注释（确定性，research R4）
- [x] T014 [US1] `packages/core/src/metrics/metrics.ts`：fps（rAF delta）、drawCalls/triangles（`renderer.info.render`）、geometries/textures（`renderer.info.memory`）、jsHeapBytes 仅在 `performance.memory` 可用时非 null（FR-003，不伪造）
- [x] T015 [US1] `packages/core/src/runtime/resource-tracker.ts` + dispose 清单化释放（track 登记 geometry/material/texture、renderer/controls dispose；逃生舱交出所有权者除外——FR-016）
- [x] T016 [US1] `packages/core/src/runtime/escape.ts`：逃生舱 v1（`escape.THREE`、`escape.renderer()`），JSDoc 显式标注"不承诺跨 three 版本兼容 + 所有权边界"
- [x] T017 [US1] 捕获空场景黄金基线 `tests/golden/us1/empty-scene.png` + 容差记录，T012 转绿
- [x] T018 [US1] `packages/sdk/src/index.ts` v1 公共面（createRuntime/Runtime 类型 re-export）+ `packages/sdk/test/exports.test.ts`（导出面 = contracts/sdk-api.md 声明的子集，防泄漏）
- [x] T019 [US1] `apps/demo` 最小页：启动空场景 + fps/drawCalls/triangles/memory 实时面板（MVP 可演示形态）
- [x] T020 [US1] `tests/render/us1-leak.spec.ts`：空场景连续运行 60s——度量全程可读、jsHeap 无持续单调增长（SC-005，允许 ±10% 波动）

**Checkpoint**: **MVP 达成**——US1 独立可演示/可测试（quickstart §1 五命令中 typecheck/test 部分绿 + §2 空场景部分可用）

---

## Phase 4: User Story 2 - 数据驱动的组件与场景系统 (Priority: P2)

**Goal**: 注册表 + 12 内置组件 + 场景树 CRUD/嵌套变换，一切编辑落为数据
**Independent Test**: 仅用内置组件经 SDK 搭建嵌套≥3 层场景；12 组件逐个孤立渲染冒烟绿

### Tests for User Story 2 (Red 先行)

- [x] T021 [US2] 失败测试先行：`packages/core/test/registry-scene.contract.test.ts`（注册/重复拒绝/显式 override/`core.`与`asset.`前缀第三方拒绝 `E_TYPE_UNKNOWN`；create/get/update(浅合并)/remove/move；非法 props → `E_PROPS_INVALID` 含 `instanceId`+`propPath`；未注册类型创建被拒且场景不变；嵌套父变换子跟随）
- [x] T022 [US2] 失败测试先行：`tests/render/us2-components.spec.ts` 参数化矩阵（12 组件逐个孤立 mount → 首帧非空 + `renderer.info` 计数合理 + dispose 后计数归零）

### Implementation for User Story 2

- [x] T023 [US2] `packages/core/src/component/define-component.ts` + `registry.ts`：defineComponent 形态（contracts/component-authoring.md §1）、注册规则、内置预装
- [x] T024 [US2] `packages/core/src/scene/scene-operations.ts`：实例树存储 + 按 ID CRUD/move + `activeCameraId()` 树序规则（树序第一个 `core.camera.perspective`）+ `setActiveCamera`（运行时态）
- [x] T025 [US2] `packages/core/src/scene/mount-layer.ts`：实例→Object3D 投影（mount/update 增量、缺省整体 remount、unmount），与 resource-tracker 集成（update 幂等、dispose 幂等——契约 §2.4/2.5）
- [x] T026 [P] [US2] 图元与相机组件（props 默认值逐字取 data-model.md §2）：`core.group`（position/rotation 弧度XYZ/scale/visible）、`core.camera.perspective`（fov:50/near:0.1/far:100）、`core.mesh.box|sphere|plane|cylinder|torus`（各自几何参数 + material 子对象 `{color:"#9aa4b2",roughness:0.55,metalness:0.1,opacity:1,transparent:false,wireframe:false}`，颜色 `"#rrggbb"`）
- [x] T027 [P] [US2] 灯光与环境组件：`core.light.ambient`（color:"#ffffff"/intensity:1）、`core.light.directional`（+position:[5,10,7]）、`core.environment`（background:"#101014"|null、fog:{color,near,far}|null、**每文档至多一个** → 第二个 `E_ENV_DUPLICATE`）
- [x] T028 [US2] `escape.sceneObject(id)`（只读约定 JSDoc）
- [x] T029 [US2] 捕获 12 组件黄金基线 `tests/golden/us2/<type>.png` + 容差记录，T022 矩阵转绿

**Checkpoint**: 组件/场景系统独立成立（不依赖序列化与交互即可全绿）

---

## Phase 5: User Story 3 - 可序列化场景 Schema 与无损往返 (Priority: P3)

**Goal**: serialize/deserialize 无损往返 + 版本策略 + asset.* 预留
**Independent Test**: 覆盖全部 12 组件、嵌套≥3 层的场景往返深度等价 100% 且幂等（SC-002）

### Tests for User Story 3 (Red 先行)

- [x] T030 [US3] 失败测试先行：`packages/core/test/schema.contract.test.ts`（serialize 顶层=schemaVersion+metadata+tree 且无运行时句柄；deserialize 原子性——校验失败零部分场景；往返 `deepEqual(serialize(deserialize(serialize(d))))` 且 ID 不变；重复反序列化幂等；空场景→合法最小文档；未来版本→`E_SCHEMA_FUTURE`+requiredVersion；损坏 JSON→`E_DOC_MALFORMED`；深度>64→`E_TREE_TOO_DEEP`；`asset.gltf`→`E_TYPE_UNKNOWN`）

### Implementation for User Story 3

- [x] T031 [US3] `packages/core/src/schema/document.ts`：SceneDocument zod **真源** + 构建脚本导出 JSON Schema 至 `docs/schema/scene-schema.v1.json`（契约机器可读形态）
- [x] T032 [US3] `packages/core/src/schema/serializer.ts` + `deserializer.ts`：全量序列化；反序列化=结构校验→版本判定→逐节点（注册表+props）校验→构建，任何失败原子回滚（contracts/scene-schema.md §5）
- [x] T033 [US3] `packages/core/src/schema/versioning.ts`：semver 比较、`migrate(doc)` 注册表骨架（v1 无真实迁移器，接口与错误路径就位——FR-009）
- [x] T034 [US3] schema 文档补 `asset.*` 命名空间与字段草案章节（`docs/schema/`），确认预留类型的预期报错行为已入契约测试

**Checkpoint**: 序列化契约独立可验（往返/幂等/错误矩阵全绿）

---

## Phase 6: User Story 4 - 声明式交互系统 (Priority: P4)

**Goal**: marker 交互组件 + 拾取/键盘/滚轮/相机变更事件 + orbit，全部无头可模拟、可往返
**Independent Test**: Playwright 模拟指针/键盘序列断言事件载荷与行为；含交互场景往返后等价生效

### Tests for User Story 4 (Red 先行)

- [x] T035 [US4] 失败测试先行：`tests/render/us4-interaction.spec.ts`（pointerenter/leave/down/up/click 载荷 `{targetId,worldPoint,screenPoint}`；命中→最近 `core.pickable` 祖先解析；**无冒泡断言**（父实例订阅收不到子实例事件）；wheel `{deltaY}`；keydown/keyup `{key,code}` 标准键值；camerachange 节流 ≤10 次/秒；orbit 拖拽改变相机且未挂载场景不受影响；第二个 orbit→`E_CONTROL_DUPLICATE`；**重入语义**（回调内对本实例 update/remove 的变更于下一帧生效、无未定义行为）；含 pickable+orbit 的文档往返后交互等价）

### Implementation for User Story 4

- [x] T036 [US4] `packages/core/src/interaction/components/`：`core.pickable`（enabled:true）与 `core.control.orbit`（默认值取 data-model §1.6：`target:[0,0,0]`、`enableDamping:true`、`dampingFactor:0.08`、`minDistance`/`maxDistance` 默认不设）marker 组件
- [x] T037 [US4] `packages/core/src/interaction/pointer.ts`：Raycaster 拾取 + enter/leave 跟踪 + 命中→最近 pickable 祖先解析 + 派发（无冒泡——FR-011）；**派发过程中订阅回调触发的场景变更排队至下一帧生效**（重入语义，spec 边界场景）
- [x] T038 [US4] `packages/core/src/interaction/event-bus.ts`：subscribe({eventTypes?,componentId?,componentType?},handler)→退订函数；空 filter=全局
- [x] T039 [US4] `packages/core/src/interaction/keyboard-wheel.ts` + camera-change 节流发射器（默认 ≤10/s，粗粒度无增量载荷——FR-021）
- [x] T040 [US4] `packages/core/src/interaction/orbit.ts`：three/addons OrbitControls 集成（挂到激活相机实例）、单激活校验、damping、dispose；测试用例固定禁用 damping 保证确定性

**Checkpoint**: 交互系统独立成立，事件契约全绿

---

## Phase 7: User Story 5 - 多包 SDK 骨架（core/sdk/http + Demo）与逃生舱 (Priority: P5)

**Goal**: 三包定型发布形态 + http 骨架服务 + Demo 全链路
**Independent Test**: 空项目装 `@threed/sdk` 跑通全链路；`/health`+`/render` 端到端矩阵全绿（SC-007）

### Tests for User Story 5 (Red 先行)

- [x] T041 [US5] 失败测试先行：`packages/sdk/test/surface-audit.test.ts`（公共面全量审计 contracts/sdk-api.md：除 escape 外任何导出签名不得含 three 类型；错误码全集导出；InstanceRef 只读形态）
- [x] T042 [US5] 失败测试先行：`packages/http/test/e2e.spec.ts`（/health 200 形态；/render 200 有效 PNG 且与浏览器侧渲染容差等价；损坏 JSON→400 `E_DOC_MALFORMED`；>5MiB→413 `E_PAYLOAD_TOO_LARGE`；单请求超时上限（默认 30s）生效且连接不悬挂；连续 20 次请求全 200 且服务存活——SC-007/contracts/http-api.md §3）

### Implementation for User Story 5

- [x] T043 [US5] `packages/sdk/src/index.ts` 定型公共面（Runtime/Scene/EventBus/Metrics/Escape/错误码 + 版本常量）+ tsup dts 发布配置（FR-012/013）
- [x] T044 [US5] `packages/http/src/server.ts`：node:http 零框架、GET /health、POST /render（width/height/format 参数）、结构化错误、5MiB 上限、`X-Threed-Version` 头
- [x] T045 [US5] `packages/http/src/render-executor.ts`：Playwright 加载内置渲染页（`packages/http/render-page/`）→ 注入 SceneDocument → 截图 png/jpeg；每请求独立 runtime 并 dispose（状态隔离）
- [x] T046 [US5] `apps/demo` 完整链路：组件搭建面板（12 内置组件增删改/嵌套）、orbit 交互 + 事件面板（targetId/事件/位置）、导出/导入 JSON（保存恢复）、度量面板（覆盖 Story1–4 主链路，FR-015）
- [x] T047 [US5] **宪法门禁：三包版本统一**：先写失败 fixture（人为制造版本漂移必须非 0 退出），再实现 `scripts/check-pkg-versions.mjs`（core/sdk/http 版本必须同号），接入 `check:pkg-versions`（FR-017）

**Checkpoint**: 全部故事完成——quickstart §2/§3/§4 可跑

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T048 [P] 使用文档：`docs/api/`（按公共 API 面组织，含逃生舱所有权边界说明）+ 三包各自 `README.md`（宪法文档门禁）
- [x] T049 [P] **文档-测试覆盖审计（SC-006）**：先植入一个"无文档导出"制造审计失败，再实现 `scripts/audit-api-coverage.mjs`（每个公共导出：docs 有条目 ∧ 至少 1 条契约测试引用），接入 `pnpm test`
- [x] T050 CI 工作流 `.github/workflows/ci.yml`：串联五门禁 `check:three-version → typecheck → test → test:render → check:pkg-versions`（宪法质量门禁的 CI 化）
- [x] T051 本地全量门禁演练：按 quickstart.md §1 逐命令执行并记录结果（任何红项回修后再跑）
- [x] T052 [P] `fixtures/standard-scene.json`（标准测试场景：全 12 组件 + 嵌套≥3 层 + 交互声明）+ `docs/quickstart.md` 消费者走查（SC-001 演练记录）
- [x] T053 基线性能记录：在 standard-scene 上采样 fps/drawCalls/triangles/memory 基线数值，写入 `docs/perf-baseline.md` 并**起草**宪法性能预算写回提案（宪法 TODO #3——写回本身需独立宪法修订提交，不在本任务内）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1（Setup）**: 无依赖，立即开始
- **Phase 2（Foundational）**: 依赖 Phase 1；**阻塞所有用户故事**（R1 探针决定全部渲染测试的可运行性；门禁脚本是宪法合规前置；ID/错误/值域是 core 三大基础件）
- **Phase 3–7（US1→US5）**: **分层递进**（本特性的故事是分层设计：runtime → 组件树 → 序列化 → 交互 → 门面打包），US_n 依赖 US_(n-1) 的 Checkpoint；每个 Checkpoint 处该故事独立可测
- **Phase 8（Polish）**: 依赖全部故事完成

### User Story Dependencies（技术分层依据）

- **US1**：依赖 Foundational；无故事间依赖
- **US2**：依赖 US1 的 runtime/mount 基础（组件挂在运行时上）
- **US3**：依赖 US2 的组件树（序列化对象是组件树）
- **US4**：依赖 US2（拾取目标是组件实例）+ US3（交互往返验证）
- **US5**：收纳 US1–US4 的公共面（sdk 定型、http 用序列化+无头渲染、demo 演示全链路）

### Within Each User Story（TDD 铁律）

1. **Red**：先完成该故事的失败测试任务（T011/T012、T021/T022、T030、T035、T041/T042），确认失败原因正确
2. **Green**：实现任务使测试转绿（Refactor 保持绿）
3. **基线**：涉及黄金图的任务在绿后捕获基线并提交（基线 = 契约的一部分）
4. 组件/纯函数件在前，集成件在后；每任务 commit

### Parallel Opportunities

- Phase 1：T002/T003/T004 三个 [P] 并行（不同文件）
- Phase 2：T007/T008/T009 三个 [P] 并行（errors/id/json-value 互不依赖）
- Phase 4：T026/T027 两个 [P] 并行（图元 vs 灯光/环境，不同组件文件）
- Phase 8：T048/T049/T052 三个 [P] 并行
- 多人协作时：Foundational 完成后，US2 的契约测试与 US1 收尾、US3 的 schema 真源设计可由不同人并行预备（实现仍按故事序合并）

---

## Parallel Example: Phase 4（US2）

```bash
# Red 阶段（两个测试文件互不依赖，可并行）：
Task: "T021 registry-scene 契约测试"
Task: "T022 组件冒烟矩阵"
# Green 阶段（T023→T024→T025 串行后）：
Task: "T026 图元与相机组件（component/primitives.ts）"
Task: "T027 灯光与环境组件（component/lights.ts）"
```

---

## Implementation Strategy

### MVP First (Story 1 Only)

1. Phase 1 + Phase 2（探针/门禁/基础件）
2. Phase 3（US1：空场景运行时 + 度量 + demo 空场景页）
3. **STOP and VALIDATE**：`pnpm check:three-version` + US1 全部测试绿 + demo 可演示 → 此即宪法要求的"底座独立运行/测试/演示"最小形态

### Incremental Delivery

1. Setup + Foundational → 基础设施就绪
2. +US1 → **MVP（独立演示）**
3. +US2 → 组件化场景（可搭建）
4. +US3 → 可保存/恢复/加载（数据闭环）
5. +US4 → 可交互
6. +US5 → 可对外交付的三包 + 服务 + Demo（完整底座）
7. +Polish → 文档/审计/CI（宪法全门禁在线）

---

## Notes

- [P] = 不同文件且无未完成依赖；[Story] 标签映射 spec.md 用户故事
- **每任务先写失败测试**（宪法 V 不可协商）；门禁脚本类任务的"失败测试"= 必须失败的 fixture 用例
- 黄金图基线一经提交即受版本管理；three 升级走集中回归（research.md 升级流程）
- 每 Checkpoint 可独立验证停止；commit 粒度 = 任务或逻辑组
- 避免：模糊任务、同文件冲突、跨故事依赖破坏独立性
