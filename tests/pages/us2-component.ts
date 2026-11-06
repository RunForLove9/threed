// US2 组件孤立冒烟页：?type=<组件类型>
// 观察 fixture：被测组件不承担相机/灯/可见几何角色时，由 fixture 补位（确定性位置）。
import { createRuntime, type Runtime } from '@threed/core';

declare global {
  interface Window {
    __rt?: Runtime;
    __testedId?: string;
    __type?: string;
  }
}

const type = new URLSearchParams(location.search).get('type') ?? 'core.mesh.box';
const rt = createRuntime({ parent: document.getElementById('host')!, width: 800, height: 600 });
const s = rt.scene;

const isMesh = type.startsWith('core.mesh.');
const isLight = type.startsWith('core.light.');
const isCamera = type === 'core.camera.perspective';

if (!isCamera) s.create('core.camera.perspective', { position: [0, 1.2, 3] });
if (!isLight) s.create('core.light.directional');
if (!isMesh) s.create('core.mesh.box', { position: [0, 0.5, 0] });

const testedId = s.create(type, isMesh ? { position: [0, 0.5, 0] } : {});

window.__rt = rt;
window.__testedId = testedId;
window.__type = type;
rt.start();
