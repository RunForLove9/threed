# Research: Three.js 核心运行时底座（Phase 0）

**Date**: 2026-11-05 | **Status**: 全部 NEEDS CLARIFICATION 已解决（Technical Context 无未决项）

研究方法：版本事实取自 npm registry 实测查询（2026-11-05）；three.js API 事实对照仓库内 `threejs-skills/skills/`（fundamentals / interaction / performance / lighting）；工程决策按宪法"依赖最小化 + 单一内核 + 测试先行"评估。实现阶段的权威参考：`threejs-fundamentals`、`threejs-interaction`、`threejs-performance`、`threejs-lighting`（本仓库已内置）。

---

## R1. 无头渲染策略（浏览器/无头一致性 + 黄金图基线）

**Decision**: 无头渲染统一走 **Playwright + Chromium + SwiftShader 软件渲染**（CI 与 `@threed/http` 共用同一管线）；核心包的非渲染子系统（schema/注册表/场景树操作）在纯 Node 中以 vitest 直接测试，不依赖 GPU。

**Rationale**: 与 three.js 0.186 兼容的唯一受支持路径是真实浏览器上下文；SwiftShader 保证无 GPU 环境下 WebGL2 可用且**跨机器确定**（软件光栅化，无厂商驱动差异），这正是黄金图比对（宪法 V）的前提。`renderer.info` 的 draw call / 三角形计数与内存计数在软件渲染下同样可用。

**Alternatives considered**:
- `headless-gl`（Node 原生 WebGL）：已停止维护，不支持 three 新版本渲染路径——放弃。
- Node + OffscreenCanvas 自绘：Node 无 WebGL 实现，等价于重新发明 headless-gl——放弃。
- WebGPURenderer：r186 已可用但 WebGPU 无头支持不稳、SwiftShader 无对应路径，且 WebGL2 覆盖面（桌面+移动）更广——v1 不采用，作为后续升级评估项。

**Verification task（已完成，T005 实测 2026-11-05）**: 探针矩阵实测（Playwright Chromium 1.64.1 / macOS）：无参、`--use-angle=swiftshader`、`+--enable-unsafe-swiftshader`、仅 `--enable-unsafe-swiftshader` 四种组合下渲染器**均为** `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`——即当前 headless Chromium **默认即 SwiftShader 软件渲染**，readPixels 非黑像素确认渲染路径真实。结论：`playwright.config.ts` 保留显式双 flags（`--use-angle=swiftshader --enable-unsafe-swiftshader`）作为跨机器/未来 Chrome 行为迁移的保障，不依赖默认行为。探针用例常驻 `tests/probe/webgl2-probe.spec.ts`（three 升级/换 CI 机器时复跑即知环境是否仍成立）。

## R2. Monorepo 工具链（版本统一治理的结构保障）

**Decision**: **pnpm workspaces + `catalog:`**。`three@0.186.1` 以 exact 版本只写在 root `pnpm-workspace.yaml` 的 catalog 中，各包经 `catalog:` 引用——物理上保证"唯一依赖声明处"（FR-001）；三包版本号手工保持一致并由 CI 脚本断言（FR-017）。构建用 `tsup`（ESM/CJS 双格式 + dts），测试 `vitest`，demo 用 `vite`。

**Rationale**: catalog 机制就是为"单一版本声明、多处消费"设计；pnpm 对 workspace 依赖的严格性（不容忍幽灵依赖）符合底座对依赖面的控制要求。工具链总量（pnpm/tsup/vitest/vite）为 TS 库 monorepo 的最小充分集。

**Alternatives considered**: npm/yarn workspaces（无 catalog，版本声明散落各包，需额外脚本防漂移）；nx/turborepo（v1 无多 app 构建图需求，纯开销）。changesets 版本自动化：v1 以 CI 断言代替，发布流程成熟后再引入（记录为后续项）。

## R3. props 契约与 schema 校验库（依赖论证：宪法"依赖最小化"）

**Decision**: 引入 **`zod@4`** 作为 `@threed/core` 的运行时依赖，承担三职：(1) 组件 props 契约声明与校验（FR-004，含错误路径定位到字段）；(2) SceneDocument 结构校验（FR-007 与"数据被篡改/损坏"边界场景）；(3) `z.toJSONSchema()` 把契约导出为 JSON Schema——**契约的机器可读真源**，文档与 SDK 类型从同一处生成。

**Rationale**: props 值域 = JSON 兼容值递归（spec Q3），zod 对该域的校验、错误信息、类型推导（z.infer → 公共类型）一站式覆盖；手写递归校验器 + 错误路径 + 类型同步是高风险重复造轮子；ajv 需要先手写 JSON Schema 再生成类型，开发体验与类型安全均弱于 zod 起步。

**Alternatives considered**: 手写校验（零依赖但重复实现且易错）；ajv + JSON Schema first（契约即文档，但类型推导弱、作者体验差）。**净增运行时依赖：+1（zod），仅入 core**。

## R4. three.js 0.186 关键 API 事实（运行时设计依据）

以下事实为运行时/交互/schema 设计的依据（对照 threejs-skills 与 three 官方约定）：

- **模块入口**：核心 `three`；addons 走 `three/addons/*` 子路径（OrbitControls = `three/addons/controls/OrbitControls.js`）。
  **实现期事实修正（2026-11-05，T001）**：three 0.186.1 **不自带 TS 类型**（package.json 无 `types` 字段、build/ 无 .d.ts）——R4 原判断有误，已引入 `@types/three@^0.186.0`（devDep，版本随 three 锁定线走，入 catalog 统一治理；不影响运行时依赖计数）。
- **场景图**：`Object3D` 父子层级即组件实例树的投影；变换语义 position/rotation(Euler, XYZ 默认序)/scale——与 `core.group` props 一一对应（schema 用数组 [x,y,z]，弧度制）。
- **拾取**：`Raycaster.intersectObjects(objects, recursive)` 返回 `{ object, point, uv, distance, face }`；命中→实例 ID 的解析规则：自命中对象沿父链上溯到最近的 `core.pickable` 挂载实例（marker 组件模式，见 data-model.md）。
- **度量**：`renderer.info` = `{ render: { calls, triangles, ... }, memory: { geometries, textures } }`；FPS 由渲染循环 delta 计算；JS 堆内存浏览器侧 `performance.memory`（不可用时降级为 null，不伪造）。
- **色彩/确定性**：`renderer.outputColorSpace`（默认 SRGB）与 tone mapping 在 Runtime 创建时**显式设定**并写入文档，不依赖默认值漂移；黄金图测试固定关抗锯齿差异（软件渲染下本就确定）与阻尼（orbit 测试用例禁用 damping）。
- **资源释放**：`geometry/material/texture.dispose()`、`renderer.dispose()`、controls.dispose()——Runtime.dispose 的清单化依据（FR-016，逃生舱交出所有权者除外）。
- **无阴影 v1**：阴影贴图涉及多次渲染与参数敏感，不进 v1 契约（避免假字段）；作为后续增量。

## R5. HTTP 服务骨架形态（依赖论证）

**Decision**: `@threed/http` 基于 **Node 内置 `node:http`**（零框架）实现 `/health` 与 `/render`；渲染执行 = 进程内 Playwright 驱动 Chromium 加载内置渲染页、注入 SceneDocument、截图返回 PNG。

**Rationale**: v1 只有 2 个端点、无中间件/路由树/鉴权需求（骨架级，FR-019），框架纯开销；Playwright 是 http 包唯一的额外运行时依赖，且与 CI 共用（R1）。**净增运行时依赖：+1（playwright，仅 http）**。

**Alternatives considered**: fastify/express（路由与生态为生产化准备，v1 显式不承诺生产化——spec FR-019）；服务端直连 WebGL（同 R1 放弃理由）。生产化（并发池/鉴权/部署）留待后续功能。

## R6. 实例 ID 生成（FR-020 落地规则）

**Decision**: 系统分配 ID = `"i" + 11 位 base36 随机`（`crypto.getRandomValues`，文档内查重，冲突重生成）；用户显式指定 ID 必须匹配 `^[A-Za-z][A-Za-z0-9_-]{0,63}$` 且文档内唯一，非法/冲突在创建时拒绝。ID 一旦写入文档即数据的一部分，序列化往返原样保留。

**Rationale**: 无需额外依赖（Web Crypto 全平台可用）；长度可控（12 字符，base36 无易混字符 0/o 问题——起始位固定字母）；显式指定通道满足"按 ID 定点编辑/外部工具预置 ID"场景。

**Alternatives considered**: UUIDv4（36 字符，文档膨胀，人读/diff 不友好）；树路径寻址与运行时临时 ID（spec 澄清 Q1 已否决）。

---

## 依赖论证汇总（宪法"依赖最小化"合规声明）

| 依赖 | 类型 | 引入包 | 论证 |
|------|------|--------|------|
| three@0.186.1 | runtime | core（catalog 引用） | 宪法 II 指定内核，exact 锁定 |
| zod@4 | runtime | core | R3：契约校验 + 类型生成 + JSON Schema 导出，避免自研 |
| playwright | runtime | http（devDep 于根用于测试） | R1/R5：唯一受支持的无头渲染路径 |
| typescript / tsup / vitest / vite | dev | 根/各包 | TS 库 monorepo 最小充分集 |

运行时依赖合计 3 项（three 宪法指定 + zod + playwright），无与 three 能力重复的依赖。

## three.js 版本决策记录（宪法遗留 TODO #2 收口）

- npm 实测（2026-11-05）：`latest` = 0.187.0（2026-10-30 发布，6 天）；0.186.1 = 上一 minor 线最新 patch（2026-09-24 发布，约 6 周稳定期）。
- **锁定 0.186.1**：取"较新 + 已被社区验证"平衡点；0.187.0 为首次集中升级头号候选，升级必须走全量渲染回归（宪法 II/V）。
- 升级流程：改 catalog 单点版本 → CI 版本唯一性 + 全量契约 + 黄金图容差比对 → 通过方可合并。
