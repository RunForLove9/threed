# 快速上手（SDK 消费者）

前置：Node ≥ 22、pnpm ≥ 9。

## 1. 安装与全量门禁（仓库根）

```bash
pnpm install && npx playwright install chromium
pnpm check:three-version   # three 全仓唯一解析 0.186.1（宪法 FR-001）
pnpm check:pkg-versions    # 三包版本统一（FR-017）
pnpm typecheck && pnpm test && pnpm test:render
```

## 2. 本地实时 Demo（Story 1–4 全链路）

```bash
pnpm dev
```

空场景首帧 → 度量面板（fps/drawCalls/triangles/内存）→ 下拉添加内置组件（嵌套/改色）→ 轨道拖拽 + hover/click 拾取（事件面板）→ 导出/导入 JSON → 销毁。

## 3. 无头渲染服务

```bash
pnpm http:serve            # http://127.0.0.1:8787
curl -s http://127.0.0.1:8787/health
curl -s -X POST http://127.0.0.1:8787/render -H 'Content-Type: application/json' \
  -d @fixtures/standard-scene.json -o out.png && file out.png   # PNG 800x600
```

## 4. 在你的项目中使用 @threed/sdk（≤20 行闭环）

v1 **本地可用优先**（spec Assumptions·发布渠道）：不发布 npm registry，从本地路径接入——

```bash
# 方式 A：file: 协议（路径指向本仓库 sdk 包）
pnpm add /path/to/threed/packages/sdk three@0.186.1
# 方式 B：开发联调推荐 link（改动即生效）
cd /path/to/threed/packages/sdk && pnpm link --global && cd ~/your-app && pnpm link --global @threed/sdk
```

```ts
import { createRuntime } from '@threed/sdk';

const rt = createRuntime({ parent: document.getElementById('app')!, width: 800, height: 600 });
rt.scene.create('core.environment', { background: '#101014' });
rt.scene.create('core.camera.perspective', { position: [0, 1.6, 5.5] }, { id: 'cam' });
rt.scene.create('core.light.directional');
rt.scene.create('core.mesh.box', { position: [0, 0.5, 0], material: { color: '#e8b04b' } }, { id: 'box' });
rt.scene.create('core.pickable', {}, { parent: 'box' });

rt.events.subscribe({ eventTypes: ['click'] }, (e) => console.log('clicked', e.targetId));

rt.start();
const doc = rt.scene.serialize({ name: 'hello' });        // 可保存/恢复/加载（存储无关）
// ...之后：rt.scene.deserialize(JSON.parse(saved)); rt.dispose();
```

类型随包交付（FR-013；v1 = 本地引用形态，dts 随包构建产物）：`tsc --noEmit` 零报错即接入正确。公共面与所有权边界见 [docs/api](./api/README.md)。
