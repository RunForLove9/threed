# 性能基线（v1 实测）

**日期**: 2026-11-06 | **场景**: `fixtures/standard-scene.json`（11 节点：环境 + 相机(orbit) + 2 灯 + 地面 + 4 mesh(含 pickable)）| **环境**: Playwright Chromium + SwiftShader 软件渲染（与 CI 同管线）| 800×600

| 指标 | 实测值 |
|------|--------|
| fps | **60.0**（59.99，软件渲染下满帧） |
| draw calls | **5** |
| triangles | **2,638** |
| geometries / textures | 5 / 1 |
| jsHeap | 21.7 MB |

复测命令：`npx playwright test perf-baseline`（输出 `[perf-baseline] {...}`）。

## 宪法性能预算（已于 2026-11-06 写回宪法 v1.1.0，收口遗留 TODO #3）

依据宪法"技术约束"：性能预算数值在首版渲染管线落地后量化并写回本节。已批准数值（宪法 v1.1.0 技术约束·性能节原文）：

- 标准测试场景（上述）在 CI 管线：**fps ≥ 30**（软件渲染基线；GPU 环境按 ≥55 另测）、**draw calls ≤ 8**、**jsHeap 增幅（60s 空场景泄漏冒烟）≤ 10%**。
- 预算语义：CI 断言而非硬拒绝——超标 = 渲染回归门禁失败，走性能归因。

> 治理说明：本提案已于 2026-11-06 批准并写回宪法 v1.1.0（MINOR：实质性扩展指引）。按 Governance 修订应以独立提交落库；2026-11-06 仓库迁移为 threed 独立仓并历史重开，本修订随新 Initial commit 一并落库（见 `specs/001-threejs-core-runtime/checklists/remaining.md` CHK002/CHK003）。
