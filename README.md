# Threed 3D 技术底座

统一的三维组件、物品、环境生成技术底座。渲染内核：**three.js 0.186.1**（唯一版本声明处：`pnpm-workspace.yaml` catalog）。

## 结构

| 包 | 职责 |
|----|------|
| `packages/core` | 运行时内核：场景树 / 组件注册表 / 交互 / 可序列化 schema / 度量（内部包） |
| `packages/sdk` | 公共 API 门面（类型 + 文档 + 显式 three 逃生舱）——**对外唯一出口** |
| `packages/http` | 无头渲染服务骨架（/health、/render） |
| `apps/demo` | 本地一键启动实时渲染演示 |

## 常用命令

```bash
pnpm install && npx playwright install chromium
pnpm check:three-version   # 宪法门禁：全仓 three 版本唯一（0.186.1）
pnpm typecheck && pnpm test && pnpm test:render
pnpm dev                   # 实时渲染 Demo
pnpm http:serve            # 无头渲染服务（默认 127.0.0.1:8787）
```

治理：`.specify/memory/constitution.md`（宪法）为最高治理文件；规格与设计见 `specs/`。
发布渠道（v1，2026-11-06 决策）：**本地可用优先**——不发布 npm registry，跨项目经 `file:` / `pnpm link` 接入（见 [docs/quickstart.md](./docs/quickstart.md) §4）。
