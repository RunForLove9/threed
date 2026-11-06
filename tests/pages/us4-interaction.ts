// US4 交互测试页：?scene=pick|orbit|plain
// 事件记录于 window.__events（{type,targetId,...} 数组）；订阅辅助暴露 window.__sub。
import { createRuntime, type Runtime, type InteractionEvent } from '@threed/core';

declare global {
  interface Window {
    __rt?: Runtime;
    __events?: InteractionEvent[];
    __sub?: (filter: { eventTypes?: string[]; componentId?: string }, tag: string) => void;
    __ids?: Record<string, string>;
  }
}

const sceneName = new URLSearchParams(location.search).get('scene') ?? 'pick';
const rt = createRuntime({ parent: document.getElementById('host')!, width: 800, height: 600 });
const s = rt.scene;
const events: InteractionEvent[] = [];
window.__events = events;
const ids: Record<string, string> = {};

if (sceneName === 'pick' || sceneName === 'plain') {
  s.create('core.environment', { background: '#101014' });
  s.create('core.camera.perspective', { position: [0, 1.2, 4] }, { id: 'cam' });
  s.create('core.light.directional');
  // 嵌套：parentGroup（可拾取）> childBox（在父拾取范围内）；soloBox 独立可拾取；ghost 不可拾取
  s.create('core.group', { position: [-1, 0.5, 0] }, { id: 'parentGroup' });
  s.create('core.pickable', {}, { parent: 'parentGroup' });
  s.create('core.mesh.box', { position: [0, 0, 0], material: { color: '#e8b04b' } }, { id: 'childBox', parent: 'parentGroup' });
  s.create('core.mesh.box', { position: [1.5, 0.5, 0] }, { id: 'soloBox' });
  s.create('core.pickable', {}, { parent: 'soloBox' });
  s.create('core.mesh.sphere', { position: [0, 0.5, -2] }, { id: 'ghostSphere' });
  Object.assign(ids, { cam: 'cam', parent: 'parentGroup', child: 'childBox', solo: 'soloBox', ghost: 'ghostSphere' });
} else if (sceneName === 'orbit') {
  s.create('core.environment', { background: '#101014' });
  s.create('core.camera.perspective', { position: [0, 1.2, 5] }, { id: 'cam' });
  s.create('core.control.orbit', { target: [0, 0.5, 0], enableDamping: false }, { parent: 'cam' });
  s.create('core.light.directional');
  s.create('core.mesh.box', { position: [0, 0.5, 0] }, { id: 'theBox' });
  Object.assign(ids, { cam: 'cam' });
}

window.__rt = rt;
window.__ids = ids;

// 订阅辅助：全局订阅 + 指定组件订阅（tag 便于断言来源）
window.__sub = (filter, tag) => {
  rt.events.subscribe(filter, (e) => {
    events.push({ ...e, ...( { tag } as object) } as InteractionEvent);
  });
};

rt.start();
