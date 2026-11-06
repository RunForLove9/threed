// T037/T039/T040：交互控制器——拾取管线 + 键盘/滚轮 + OrbitControls 集成。
// 重入语义（spec 边界场景）：事件派发期间订阅回调触发的 update/remove/move 变更排队至下一帧（graph 挂起队列）。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type * as THREE_NS from 'three';
import type { SceneGraph } from '../scene/scene-graph';
import type { EventBus, InteractionEvent } from './events';

interface OrbitProps {
  target: [number, number, number];
  minDistance?: number;
  maxDistance?: number;
  enableDamping: boolean;
  dampingFactor: number;
}

const CAMERA_CHANGE_MIN_INTERVAL_MS = 100; // ≤10 次/秒（FR-021）

export class InteractionController {
  private graph: SceneGraph;
  private canvas: HTMLCanvasElement;
  private events: EventBus;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hoverId: string | null = null;
  private downId: string | null = null;
  private orbit: OrbitControls | null = null;
  private orbitCameraId: string | null = null;
  private lastCamChange = 0;
  private disposed = false;

  constructor(deps: { graph: SceneGraph; canvas: HTMLCanvasElement; events: EventBus }) {
    this.graph = deps.graph;
    this.canvas = deps.canvas;
    this.events = deps.events;

    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKey);
      window.addEventListener('keyup', this.onKey);
    }
    // 树变更 → 重新同步 orbit（挂载/参数/移除）
    this.graph.onChange = () => this.syncOrbit();
    this.syncOrbit();
  }

  // ---- 拾取 ----
  private resolveHit(x: number, y: number): { targetId: string; worldPoint: THREE.Vector3 } | null {
    const roots = this.graph.pickableRoots();
    if (roots.length === 0) return null;
    const camera = this.graph.activeCameraObject();
    if (!camera) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, camera as THREE_NS.PerspectiveCamera);
    const hits = this.raycaster.intersectObjects(
      roots.map((r) => r.object3d),
      true,
    );
    const hit = hits[0];
    if (!hit) return null;
    // 最近 pickable 祖先解析：自命中对象沿父链上溯第一个命中根（data-model §1.6）
    const rootSet = new Map(roots.map((r) => [r.object3d as THREE_NS.Object3D, r.instanceId]));
    let o: THREE_NS.Object3D | null = hit.object;
    while (o) {
      const found = rootSet.get(o);
      if (found) return { targetId: found, worldPoint: hit.point.clone() };
      o = o.parent;
    }
    return null;
  }

  private dispatch(e: InteractionEvent, meta?: { targetType?: string | null }): void {
    // 重入语义：派发窗口内 update/remove/move 排队，下一帧由渲染循环 flush
    this.graph.holdMutations();
    try {
      this.events.emit(e, meta);
    } finally {
      this.graph.releaseMutations();
    }
  }

  private typeOf(id: string | null): string | null {
    if (!id) return null;
    return this.graph.ops.get(id)?.type ?? null;
  }

  private onPointerMove = (ev: PointerEvent): void => {
    const hit = this.resolveHit(ev.clientX, ev.clientY);
    const newId = hit?.targetId ?? null;
    if (newId !== this.hoverId) {
      const prev = this.hoverId;
      this.hoverId = newId;
      if (prev !== null) {
        this.dispatch({ type: 'pointerleave', targetId: prev, worldPoint: hit ? [hit.worldPoint.x, hit.worldPoint.y, hit.worldPoint.z] : null, screenPoint: [ev.clientX, ev.clientY] }, { targetType: this.typeOf(prev) });
      }
      if (newId !== null && hit) {
        this.dispatch({ type: 'pointerenter', targetId: newId, worldPoint: [hit.worldPoint.x, hit.worldPoint.y, hit.worldPoint.z], screenPoint: [ev.clientX, ev.clientY] }, { targetType: this.typeOf(newId) });
      }
    }
  };

  private onPointerDown = (ev: PointerEvent): void => {
    const hit = this.resolveHit(ev.clientX, ev.clientY);
    this.downId = hit?.targetId ?? null;
    if (this.downId !== null && hit) {
      this.dispatch({ type: 'pointerdown', targetId: this.downId, worldPoint: [hit.worldPoint.x, hit.worldPoint.y, hit.worldPoint.z], screenPoint: [ev.clientX, ev.clientY] }, { targetType: this.typeOf(this.downId) });
    }
  };

  private onPointerUp = (ev: PointerEvent): void => {
    const hit = this.resolveHit(ev.clientX, ev.clientY);
    const upId = hit?.targetId ?? null;
    if (upId !== null && hit) {
      this.dispatch({ type: 'pointerup', targetId: upId, worldPoint: [hit.worldPoint.x, hit.worldPoint.y, hit.worldPoint.z], screenPoint: [ev.clientX, ev.clientY] }, { targetType: this.typeOf(upId) });
      if (this.downId === upId) {
        this.dispatch({ type: 'click', targetId: upId, worldPoint: [hit.worldPoint.x, hit.worldPoint.y, hit.worldPoint.z], screenPoint: [ev.clientX, ev.clientY] }, { targetType: this.typeOf(upId) });
      }
    }
    this.downId = null;
  };

  private onWheel = (ev: WheelEvent): void => {
    this.dispatch({ type: 'wheel', targetId: this.hoverId, screenPoint: [ev.clientX, ev.clientY], deltaY: ev.deltaY }, { targetType: this.typeOf(this.hoverId) });
  };

  private onKey = (ev: KeyboardEvent): void => {
    if (ev.isComposing || ev.keyCode === 229) return; // 无输入法/组合键语义（FR-021）
    this.dispatch({ type: ev.type === 'keydown' ? 'keydown' : 'keyup', key: ev.key, code: ev.code });
  };

  // ---- OrbitControls 集成（T040）----
  private syncOrbit(): void {
    if (this.disposed) return;
    const marker = this.graph.orbitMarker();
    const camera = this.graph.activeCameraObject();
    if (!marker || !camera) {
      this.disposeOrbit();
      return;
    }
    const props = marker.props as unknown as OrbitProps;
    if (!this.orbit || this.orbitCameraId !== marker.cameraInstanceId || this.orbit.object !== camera) {
      this.disposeOrbit();
      this.orbit = new OrbitControls(camera as THREE_NS.PerspectiveCamera, this.canvas);
      this.orbitCameraId = marker.cameraInstanceId;
      this.orbit.addEventListener('change', this.onOrbitChange);
    }
    this.orbit.target.set(...props.target);
    this.orbit.enableDamping = props.enableDamping;
    this.orbit.dampingFactor = props.dampingFactor;
    this.orbit.minDistance = props.minDistance ?? 0;
    this.orbit.maxDistance = props.maxDistance ?? Infinity;
  }

  private onOrbitChange = (): void => {
    const now = performance.now();
    if (now - this.lastCamChange < CAMERA_CHANGE_MIN_INTERVAL_MS) return; // 节流 ≤10/s
    this.lastCamChange = now;
    const cameraId = this.graph.activeCameraId();
    if (cameraId) this.dispatch({ type: 'camerachange', cameraId });
  };

  private disposeOrbit(): void {
    if (this.orbit) {
      this.orbit.removeEventListener('change', this.onOrbitChange);
      this.orbit.dispose();
      this.orbit = null;
      this.orbitCameraId = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.disposeOrbit();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKey);
      window.removeEventListener('keyup', this.onKey);
    }
    this.graph.onChange = null;
  }
}
