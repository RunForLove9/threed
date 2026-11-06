# Quickstart: 端到端验证指南

**Feature**: 001-threejs-core-runtime | 前置：Node ≥ 22、pnpm ≥ 9、可联网（首次拉 Chromium）

> 本文件是验证/演示指南；实现细节在 tasks.md 与实现阶段。命令以根 `package.json` 脚本为准（tasks 阶段建立）。

## 1. 安装与全量门禁（对应 SC-003/SC-004）

```bash
pnpm install                 # workspace 安装；three 经 catalog 唯一解析为 0.186.1
npx playwright install chromium
pnpm check:three-version     # 期望: 输出唯一版本 0.186.1，退出码 0（FR-001/SC-003）
pnpm typecheck               # 期望: 0 错误（严格模式）
pnpm test                    # 单元 + 契约（vitest）；期望: 全绿，含 schema 往返/幂等、props 拒绝、事件模拟
pnpm test:render             # Playwright 无头：渲染冒烟 + 黄金图容差比对；期望: 全绿
```

**通过判据**: 五条命令全部退出码 0；`test` 覆盖矩阵含 12 内置组件逐个冒烟（SC-002 的自动化部分）；无任何业务依赖参与构建（SC-004 独立构建/测试/演示三项之一）。

## 2. 本地实时渲染 Demo（对应 Story 1–4 主链路 + SC-001/SC-004）

```bash
pnpm dev                     # 启动 apps/demo（Vite），自动开浏览器
```

**期望看到并可操作**: 空场景首帧 → 面板显示 fps / draw calls / triangles / memory（FR-003）→ 用内置组件搭建嵌套场景 → 拖拽轨道相机、hover/click 拾取（事件面板显示 targetId/事件/位置）→ 一键「导出 JSON / 导入 JSON」完成保存恢复（序列化往返）→ 页面销毁重建无报错。新开发者依 README 10 分钟内完成同链路即 SC-001 通过。

## 3. 无头渲染服务（对应 Story 5 + SC-007）

```bash
pnpm http:serve              # 默认 http://127.0.0.1:8787
curl -s http://127.0.0.1:8787/health          # 期望: {"ok":true,"version":"...","schemaVersion":"1.0.0"}
curl -s -X POST http://127.0.0.1:8787/render \
  -H 'Content-Type: application/json' \
  -d @fixtures/standard-scene.json -o out.png # 期望: 200，out.png 为该场景渲染图
file out.png                                 # 期望: PNG image data, 800 x 600
curl -s -X POST .../render -d '{bad json'    # 期望: 400 {"error":{"code":"E_DOC_MALFORMED"...}}，服务存活
```

端到端矩阵（健康/渲染/损坏/超限/连续 20 次）由 `pnpm test` 中 http 端到端套件自动执行——见 [contracts/http-api.md §3](./contracts/http-api.md)。

## 4. SDK 消费冒烟（对应 Story 5 场景 1 + SC-001）

```bash
cd /tmp && pnpm init && pnpm add <repo>/packages/sdk   # 或发布后的 @threed/sdk
# 依 docs/quickstart 写 ≤ 20 行：createRuntime → 12 内置组件搭场景 → serialize 存文件 → 新 runtime deserialize → dispose
npx tsc --noEmit             # 期望: 0 错误（公共类型完整，FR-013）
```

## 5. 成功标准映射

| 验证步骤 | 覆盖 |
|----------|------|
| §1 五命令全绿 | SC-002（往返/幂等自动化）、SC-003（版本唯一 + 契约 + 黄金图）、SC-004（独立构建/测试） |
| §2 Demo 全链路 | SC-001（10 分钟链路）、SC-005（60s 空场景度量/无泄漏，另有自动化用例） |
| §3 http 矩阵 | SC-007 |
| §4 消费冒烟 | SC-001、SC-006（文档-测试覆盖审计由 `pnpm test` 的审计用例输出） |
