// Threed Demo —— Story 1–4 主链路（T046）：启动 → 搭建（增删改/嵌套）→ 序列化（导出/导入）→ 交互（orbit/拾取/事件面板）→ 销毁
import { createRuntime, BUILTIN_TYPES, type Runtime, type InteractionEvent } from '@threed/sdk';

const rt: Runtime = createRuntime({ parent: document.querySelector<HTMLElement>('#app')!, width: 800, height: 600 });
const s = rt.scene;

// ---- 初始场景（含交互声明）----
s.create('core.environment', { background: '#101014' });
s.create('core.camera.perspective', { position: [0, 2.2, 6] }, { id: 'cam' });
s.create('core.control.orbit', { target: [0, 0.5, 0] }, { parent: 'cam' });
s.create('core.light.ambient', { intensity: 0.6 });
s.create('core.light.directional');
const stage = s.create('core.group', { position: [0, 0, 0] }, { id: 'stage' });
s.create('core.mesh.box', { position: [-1.4, 0.5, 0], material: { color: '#e8b04b' } }, { parent: 'stage', id: 'box1' });
s.create('core.pickable', {}, { parent: 'box1' });
s.create('core.mesh.sphere', { position: [0, 0.5, 0], material: { color: '#7fd1ae' } }, { parent: 'stage', id: 'sph1' });
s.create('core.pickable', {}, { parent: 'sph1' });

rt.start();

// ---- UI 骨架 ----
const ui = document.createElement('div');
ui.style.cssText =
  'position:fixed;top:8px;right:8px;z-index:10;display:flex;flex-direction:column;gap:6px;font:12px/1.5 ui-monospace,monospace;background:rgba(16,16,20,.85);color:#cfe3d8;padding:10px;border-radius:8px;max-height:92vh;overflow:auto';
ui.innerHTML = `
  <button data-act="add">＋ 添加组件</button>
  <select data-act="type">${BUILTIN_TYPES.filter((t) => t !== 'core.environment').map((t) => `<option>${t}</option>`).join('')}</select>
  <label>color <input data-act="color" type="color" value="#e8b04b"></label>
  <button data-act="export">⬇ 导出 JSON</button>
  <button data-act="import">⬆ 导入 JSON</button>
  <button data-act="dispose">🗑 销毁运行时</button>
  <pre data-act="tree" style="margin:0;color:#9fe8c0"></pre>
  <pre data-act="events" style="margin:0;color:#e8b04b;max-height:180px;overflow:auto"></pre>`;
document.body.appendChild(ui);

const metrics = document.createElement('pre');
metrics.style.cssText =
  'position:fixed;bottom:8px;left:8px;z-index:10;margin:0;padding:8px 10px;border-radius:8px;background:rgba(16,16,20,.82);color:#9fe8c0;font:12px/1.6 ui-monospace,monospace';
document.body.appendChild(metrics);

const $ = <T extends HTMLElement>(sel: string): T => ui.querySelector<T>(sel)!;
const refreshTree = (): void => {
  const lines: string[] = [];
  const doc = s.serialize();
  const walk = (n: { id: string; type: string; children: unknown[] }, depth: number): void => {
    lines.push(`${'  '.repeat(depth)}${n.type} #${n.id}`);
    for (const c of n.children as { id: string; type: string; children: unknown[] }[]) walk(c, depth + 1);
  };
  walk(doc.tree, 0);
  $('[data-act=tree]').textContent = lines.join('\n');
};
refreshTree();

let counter = 0;
ui.addEventListener('click', async (ev) => {
  const act = (ev.target as HTMLElement).dataset?.act;
  if (act === 'add') {
    const type = $<HTMLSelectElement>('[data-act=type]').value;
    const color = $<HTMLInputElement>('[data-act=color]').value;
    const id = `node-${++counter}`;
    const parent = ['core.pickable', 'core.control.orbit'].includes(type) ? (s.activeCameraId() ?? undefined) : 'stage';
    s.create(type, { position: [Math.random() * 2 - 1, 0.5, 0], material: { color } }, { id, parent });
    refreshTree();
  } else if (act === 'export') {
    const doc = s.serialize({ name: 'demo-export' });
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scene.json';
    a.click();
  } else if (act === 'import') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const text = await input.files?.[0]?.text();
      if (!text) return;
      try {
        s.deserialize(JSON.parse(text));
        refreshTree();
      } catch (e) {
        alert(`导入失败：${(e as Error).message}`);
      }
    };
    input.click();
  } else if (act === 'dispose') {
    rt.dispose();
    metrics.textContent = 'runtime disposed';
  }
});

// 事件面板（全局订阅：pointer 族 + camerachange）
const evLines: string[] = [];
rt.events.subscribe({}, (e: InteractionEvent) => {
  if (e.type === 'camerachange') return; // 高频，仅面板过滤
  evLines.unshift(`${e.type} → ${('targetId' in e ? e.targetId : '') || ('cameraId' in e ? e.cameraId : '') || ('key' in e ? e.key : '')}`);
  if (evLines.length > 8) evLines.pop();
  $('[data-act=events]').textContent = evLines.join('\n');
});

setInterval(() => {
  if (!rt.metrics) return;
  try {
    const m = rt.metrics.snapshot();
    metrics.textContent = [
      `fps ${m.fps === null ? '…' : m.fps.toFixed(0)}   drawCalls ${m.drawCalls}   tris ${m.triangles}`,
      `geo ${m.geometries} / tex ${m.textures}   heap ${m.jsHeapBytes === null ? 'n/a' : (m.jsHeapBytes / 1048576).toFixed(1) + 'MB'}`,
    ].join('\n');
  } catch {
    /* disposed */
  }
}, 500);

window.addEventListener('beforeunload', () => rt.dispose());
console.log('threed demo: full chain ready (build / serialize / interact / dispose)');
