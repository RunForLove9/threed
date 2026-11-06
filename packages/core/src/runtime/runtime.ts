// T013/T015 + T024/T025 集成：Runtime = 渲染器 + 场景图（数据树 + 挂载投影）+ 度量 + 事件（US4）
// 渲染输出 v1 固定（无公共选项）：outputColorSpace=SRGB、toneMapping=none —— 黄金图与 /render 等价性的确定性基线。
import * as THREE from 'three';
import { ThreedError } from '../errors';
import { normalizeOptions, type RuntimeOptions, type NormalizedOptions } from './options';
import { ResourceTracker } from './resource-tracker';
import { createMetricsRecorder, type MetricsSnapshot } from '../metrics/metrics';
import { createEscape, type EscapeHatch } from './escape';
import { SceneGraph, type SceneOperations } from '../scene/scene-graph';
import { registerBuiltinComponents } from '../component/builtins';
import type { ComponentRegistry } from '../component/registry';
import { EventBus, type InteractionEvent, type EventFilter } from '../interaction/events';
import { InteractionController } from '../interaction/controller';
import { serializeGraph, deserializeIntoGraph } from '../schema/serializer';
import type { SceneDocument } from '../schema/document';

export interface MetricsSource {
  snapshot(): MetricsSnapshot;
}

/** SceneOperations + 序列化（contracts/sdk-api §2）。 */
export type RuntimeScene = SceneOperations & {
  serialize(metadata?: { name?: string; created?: string }): SceneDocument;
  deserialize(doc: SceneDocument): void;
};

export interface Runtime {
  readonly registry: ComponentRegistry;
  readonly scene: RuntimeScene;
  readonly events: { subscribe(filter: EventFilter, handler: (e: InteractionEvent) => void): () => void };
  readonly escape: RuntimeEscape;
  readonly metrics: MetricsSource;
  start(): void;
  stop(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** 逃生舱（FR-012）：sceneObject 为 US2 增补。⚠ 全部不承诺跨 three 版本兼容。 */
export interface RuntimeEscape extends EscapeHatch {
  /** 实例对应的 three Object3D（只读约定——MUST NOT 对其做结构性修改）。 */
  sceneObject(id: string): unknown;
}

export function disposedGuard() {
  let disposed = false;
  return {
    check(): void {
      if (disposed) throw new ThreedError('E_RUNTIME_DISPOSED', '运行时已销毁，公共调用不可用');
    },
    dispose(): void {
      disposed = true;
    },
  };
}

export function createRuntime(options?: RuntimeOptions): Runtime {
  const norm: NormalizedOptions = normalizeOptions(options);
  const guard = disposedGuard();
  const tracker = new ResourceTracker(); // 运行时级资源（renderer 等）；实例级资源在 SceneGraph 各挂载内

  const renderer = new THREE.WebGLRenderer({
    canvas: (options?.canvas as HTMLCanvasElement | undefined) ?? undefined,
    antialias: true,
  });
  // 确定性基线（data-model §1.5）：显式设定，不依赖默认值漂移
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setSize(norm.width, norm.height, true);

  if (!options?.canvas) {
    const host = options?.parent ?? (typeof document !== 'undefined' ? document.body : undefined);
    host?.appendChild(renderer.domElement);
  }

  // 场景图（数据 + 投影）与内置组件预装（宪法 IV：内置与第三方同一注册机制）
  const graph = new SceneGraph(norm.width / norm.height);
  registerBuiltinComponents(graph.registry);

  // 交互：事件总线（无冒泡）+ 控制器（拾取/键盘/滚轮/orbit；重入变更排队下一帧）
  const eventBus = new EventBus();
  const controller = new InteractionController({ graph, canvas: renderer.domElement, events: eventBus });

  // bootstrap 相机：无相机组件时的兜底（有相机组件即让位——activeCameraId 树序规则）
  const bootstrapCamera = new THREE.PerspectiveCamera(50, norm.width / norm.height, 0.1, 100);
  bootstrapCamera.position.set(0, 1.2, 5);
  bootstrapCamera.lookAt(0, 0.5, 0);
  const renderCamera = (): THREE.PerspectiveCamera => graph.activeCameraObject() ?? bootstrapCamera;

  const recorder = createMetricsRecorder();
  let rafId = 0;
  let running = false;
  const loop = (now: number): void => {
    recorder.recordFrame(now);
    graph.flushMutations(); // 上一帧事件回调排队的变更在本帧生效（重入语义）
    renderer.render(graph.threeScene, renderCamera());
    if (running) rafId = requestAnimationFrame(loop);
  };

  const escape: RuntimeEscape = Object.freeze({
    ...createEscape(renderer),
    sceneObject: (id: string): unknown => graph.objectOf(id),
  }) as RuntimeEscape;

  const runtime: Runtime = {
    registry: graph.registry,
    scene: Object.freeze({
      ...graph.ops,
      serialize: (metadata?: { name?: string; created?: string }) => serializeGraph(graph, metadata),
      deserialize: (doc: SceneDocument) => deserializeIntoGraph(graph, doc),
    }) as RuntimeScene,
    events: {
      subscribe: (filter, handler) => eventBus.subscribe(filter, handler),
    },
    escape,
    metrics: {
      snapshot(): MetricsSnapshot {
        guard.check();
        return recorder.snapshot(renderer);
      },
    },
    start(): void {
      guard.check();
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(loop);
      }
    },
    stop(): void {
      guard.check();
      running = false;
      cancelAnimationFrame(rafId);
    },
    resize(width: number, height: number): void {
      guard.check();
      const n = normalizeOptions({ width, height });
      renderer.setSize(n.width, n.height, true);
      bootstrapCamera.aspect = n.width / n.height;
      bootstrapCamera.updateProjectionMatrix();
      graph.setAspect(n.width / n.height);
    },
    dispose(): void {
      guard.dispose();
      running = false;
      cancelAnimationFrame(rafId);
      controller.dispose(); // 交互监听与 orbit 先于场景释放
      graph.disposeAll(); // 实例级资源递归释放（E_TREE... 全部 unmount）
      tracker.disposeAll();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  return runtime;
}
