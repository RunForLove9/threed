# Contract: @threed/http 服务 API（http-api）

**Status**: API 评审稿 | 骨架级承诺（FR-019）：并发、鉴权、部署不在 v1 范围

## 1. 端点

### `GET /health`

`200` → `{ "ok": true, "version": "<sdk 包版本>", "schemaVersion": "<支持的最新 schema>" }`

### `POST /render`

请求：`Content-Type: application/json`，body = 完整 [SceneDocument](./scene-schema.md)。
可选查询参数：`width`（默认 800）、`height`（默认 600）、`format`（`png`|`jpeg`，默认 png）。

响应：

| 状态 | Content-Type | Body |
|------|--------------|------|
| 200 | image/png 或 image/jpeg | 场景无头渲染图像（SwiftShader 软件渲染，跨机器确定） |
| 400 | application/json | `{ "error": { "code": "...", "message": "...", "details?": {...} } }`（复用 sdk-api §6 错误码，如 `E_DOC_MALFORMED` / `E_TYPE_UNKNOWN`） |
| 413 | application/json | body 超过上限（默认 5 MiB）：`{ "error": { "code": "E_PAYLOAD_TOO_LARGE" } }` |
| 500 | application/json | 渲染管线意外失败：`{ "error": { "code": "E_RENDER_FAILED" } }`，服务保持存活（spec 边界场景） |

所有响应携带 `X-Threed-Version: <sdk 包版本>`。

## 2. 行为契约

1. 渲染语义与浏览器侧完全一致：同一 SceneDocument 在 demo（浏览器 WebGL）与 `/render`（SwiftShader）产出**像素容差内等价**的图像——这是"同一套调用方式、两个环境"（FR-002）的服务端验证口径，进契约测试。
2. 状态隔离：每个请求构建独立运行时并 dispose（无跨请求状态泄漏）；单请求失败不影响服务存活。
3. 时限：v1 为骨架级、**不承诺性能指标**，但单请求必有超时上限（**默认 30s**，可由实现配置）——超时返回 500 `E_RENDER_FAILED`，连接不悬挂。
4. 鉴权：v1 无（骨架）；生产化为后续功能。
5. 实现栈：`node:http`（零框架）+ 进程内 Playwright；依赖论证见 [research.md R5](../research.md)。

## 3. 端到端验收（SC-007）

```
启动 → GET /health 200
     → POST /render（标准测试场景）→ 200 + 有效 PNG（与基准图容差比对通过）
     → POST /render（损坏 JSON）→ 400 E_DOC_MALFORMED，服务存活
     → POST /render（>5MiB）→ 413，服务存活
     → 连续 20 次正常请求全部 200（可用性）
```
