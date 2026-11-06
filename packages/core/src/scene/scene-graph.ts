// T024/T025：场景图 = 组件实例树（数据，可序列化）+ Object3D 投影（挂载层）。
// 宪法 III：一切创建/编辑落为树数据变更；渲染只是数据投影。
// 激活相机规则：树序（DFS 先序）第一个 core.camera.perspective；运行时切换为 override 态（不入文档）。
import * as THREE from 'three';
import { ThreedError } from '../errors';
import {
  ComponentRegistry,
  parseProps,
  type ComponentContext,
  type ComponentDefinition,
} from '../component/registry';
import { ResourceTracker } from '../runtime/resource-tracker';
import { generateSystemId, validateExplicitId, assertUniqueId } from '../schema/id';
import type { JsonValue } from '../component/json-value';
import type { DocumentNode, JsonRecord } from '../schema/document';

export interface InstanceNodeData {
  id: string;
  type: string;
  props: Record<string, JsonValue>;
  children: InstanceNodeData[];
}

export interface InstanceRef {
  readonly id: string;
  readonly type: string;
  readonly props: Readonly<Record<string, JsonValue>>;
}

export interface SceneOperations {
  create(type: string, props?: Record<string, JsonValue>, options?: { id?: string; parent?: string }): InstanceRef;
  get(id: string): InstanceRef | null;
  update(id: string, props: Partial<Record<string, JsonValue>>): void;
  remove(id: string): void;
  move(id: string, parent: string, index?: number): void;
  activeCameraId(): string | null;
  setActiveCamera(id: string): void;
}

const ROOT_ID = '__root__';
const MAX_DEPTH = 64;
/** 文档形态的根节点固定 id（结构性：往返中原样再生，不承载用户实例身份）。 */
export const DOC_ROOT_ID = 'root';

/** 单例组件规则（spec 边界场景：环境/相机控制重复挂载报错）。 */
const SINGLETON_RULES: Record<string, 'E_ENV_DUPLICATE' | 'E_CONTROL_DUPLICATE'> = {
  'core.environment': 'E_ENV_DUPLICATE',
  'core.control.orbit': 'E_CONTROL_DUPLICATE',
};
const CAMERA_TYPE = 'core.camera.perspective';

interface Mounted {
  node: InstanceNodeData;
  def: ComponentDefinition;
  object3d: THREE.Object3D;
  tracker: ResourceTracker;
  props: unknown; // 解析后（含默认值）
}

export class SceneGraph {
  readonly registry = new ComponentRegistry();
  /** 渲染用 three 场景根（挂载层的根 Object3D）。 */
  readonly threeScene = new THREE.Scene();
  private root: InstanceNodeData = { id: ROOT_ID, type: 'core.group', props: {}, children: [] };
  private mounts = new Map<string, Mounted>();
  private ids = new Set<string>([ROOT_ID]);
  private cameraOverride: string | null = null;
  private aspect: number;
  /** 激活相机变化回调（runtime 接管渲染相机切换）。 */
  onActiveCameraChange: (() => void) | null = null;

  constructor(aspect = 800 / 600) {
    this.aspect = aspect;
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    const cam = this.activeCameraObject();
    if (cam) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
  }

  // ---- SceneOperations 公共面 ----
  readonly ops: SceneOperations = {
    create: (type, props, options) => this.create(type, props, options),
    get: (id) => this.get(id),
    update: (id, props) => this.enqueueVoid(() => this.update(id, props)),
    remove: (id) => this.enqueueVoid(() => this.remove(id)),
    move: (id, parent, index) => this.enqueueVoid(() => this.move(id, parent, index)),
    activeCameraId: () => this.activeCameraId(),
    setActiveCamera: (id) => this.setActiveCamera(id),
  };

  // ---- 重入语义（spec 边界场景：事件派发窗口内的变更排队下一帧生效）----
  private deferring = false;
  private pending: Array<() => void> = [];

  private enqueueVoid(fn: () => void): void {
    if (this.deferring) this.pending.push(fn);
    else fn();
  }
  holdMutations(): void {
    this.deferring = true;
  }
  releaseMutations(): void {
    this.deferring = false;
  }
  /** 渲染循环每帧开头调用：应用排队变更。 */
  flushMutations(): void {
    if (this.pending.length === 0) return;
    const q = this.pending;
    this.pending = [];
    for (const f of q) f();
  }

  /** 树变更回调（交互控制器同步 orbit 用）。 */
  onChange: (() => void) | null = null;
  private notifyChange(): void {
    this.onChange?.();
  }

  /** 拾取根清单：启用的 core.pickable marker 的父实例（最近 pickable 祖先解析依据）。 */
  pickableRoots(): Array<{ object3d: THREE.Object3D; instanceId: string }> {
    const byObject = new Map<THREE.Object3D, string>();
    for (const [id, m] of this.mounts) byObject.set(m.object3d, id);
    const out: Array<{ object3d: THREE.Object3D; instanceId: string }> = [];
    for (const m of this.mounts.values()) {
      if (m.node.type === 'core.pickable' && m.node.props.enabled !== false) {
        const parentObj = m.object3d.parent;
        const pid = parentObj ? byObject.get(parentObj) : undefined;
        if (pid && parentObj) out.push({ object3d: parentObj, instanceId: pid });
      }
    }
    return out;
  }

  /** orbit marker 状态：props（已解析）+ 其挂载的相机实例 ID；无则 null。 */
  orbitMarker(): { props: Record<string, JsonValue>; cameraInstanceId: string } | null {
    for (const m of this.mounts.values()) {
      if (m.node.type === 'core.control.orbit') {
        const parentObj = m.object3d.parent;
        const byObject = new Map<THREE.Object3D, string>();
        for (const [id, mm] of this.mounts) byObject.set(mm.object3d, id);
        const pid = parentObj ? byObject.get(parentObj) : undefined;
        if (pid) return { props: { ...m.node.props }, cameraInstanceId: pid };
      }
    }
    return null;
  }

  private ctxFor(tracker: ResourceTracker): ComponentContext {
    return { track: <T extends { dispose(): void }>(d: T): T => tracker.track(d), scene: this.threeScene, aspect: this.aspect };
  }

  private mount(node: InstanceNodeData, parentObject: THREE.Object3D): void {
    const def = this.registry.get(node.type);
    if (!def) {
      throw new ThreedError('E_TYPE_UNKNOWN', `未注册的组件类型: ${node.type}`, { instanceId: node.id, type: node.type });
    }
    const tracker = new ResourceTracker();
    const parsed = parseProps(def, node.props, node.id);
    const object3d = def.mount({ id: node.id, props: parsed as never }, this.ctxFor(tracker));
    parentObject.add(object3d);
    this.mounts.set(node.id, { node, def, object3d, tracker, props: parsed });
  }

  private unmount(node: InstanceNodeData): void {
    for (const c of [...node.children]) this.unmount(c);
    const m = this.mounts.get(node.id);
    if (m) {
      m.def.dispose?.(m.object3d);
      m.tracker.disposeAll(); // 实例级资源（geometry/material）即时释放
      m.object3d.parent?.remove(m.object3d);
      this.mounts.delete(node.id);
    }
    this.ids.delete(node.id);
  }

  private find(id: string): InstanceNodeData | null {
    if (id === ROOT_ID) return this.root;
    return this.dfsFind(this.root, id);
  }
  private dfsFind(n: InstanceNodeData, id: string): InstanceNodeData | null {
    for (const c of n.children) {
      if (c.id === id) return c;
      const r = this.dfsFind(c, id);
      if (r) return r;
    }
    return null;
  }
  private findParent(id: string): InstanceNodeData | null {
    const walk = (n: InstanceNodeData): InstanceNodeData | null => {
      for (const c of n.children) {
        if (c.id === id) return n;
        const r = walk(c);
        if (r) return r;
      }
      return null;
    };
    return walk(this.root);
  }
  private countType(type: string): number {
    let count = 0;
    const walk = (n: InstanceNodeData): void => {
      for (const c of n.children) {
        if (c.type === type) count++;
        walk(c);
      }
    };
    walk(this.root);
    return count;
  }
  private depthOf(id: string): number {
    let d = 0;
    let cur = this.findParent(id);
    while (cur) {
      d++;
      cur = this.findParent(cur.id);
    }
    return d;
  }

  create(type: string, props?: Record<string, JsonValue>, options?: { id?: string; parent?: string }): InstanceRef {
    const def = this.registry.get(type);
    if (!def) {
      throw new ThreedError('E_TYPE_UNKNOWN', `未注册的组件类型: ${type}`, { type });
    }
    const dup = SINGLETON_RULES[type];
    if (dup && this.countType(type) >= 1) {
      throw new ThreedError(dup, `${type} 每文档至多一个`, { type });
    }
    // ID：显式指定（校验+查重）或系统分配
    let id: string;
    if (options?.id !== undefined) {
      validateExplicitId(options.id);
      assertUniqueId(options.id, this.ids);
      id = options.id;
    } else {
      do {
        id = generateSystemId();
      } while (this.ids.has(id));
    }
    const parentId = options?.parent ?? ROOT_ID;
    const parent = this.find(parentId);
    if (!parent) throw new ThreedError('E_INSTANCE_NOT_FOUND', `父实例不存在: ${parentId}`, { id: parentId });
    // 深度约束（树深软上限 64，含 root）
    if (this.depthOf(parentId) + 2 > MAX_DEPTH) {
      throw new ThreedError('E_TREE_TOO_DEEP', `树深超过 ${MAX_DEPTH}`, { instanceId: id, depth: this.depthOf(parentId) + 2 });
    }
    // 先校验后插入（原子：校验失败树不变）
    const parsed = parseProps(def, props ?? {}, id);
    const node: InstanceNodeData = { id, type, props: parsed as Record<string, JsonValue>, children: [] };
    const parentMount = this.mounts.get(parentId);
    const parentObject = parentMount ? parentMount.object3d : this.threeScene;
    this.mount(node, parentObject);
    parent.children.push(node);
    this.ids.add(id);
    if (type === CAMERA_TYPE) this.notifyCamera();
    this.notifyChange();
    return this.refOf(node);
  }

  get(id: string): InstanceRef | null {
    const n = this.find(id);
    return n ? this.refOf(n) : null;
  }

  update(id: string, props: Partial<Record<string, JsonValue>>): void {
    const n = this.find(id);
    if (!n) throw new ThreedError('E_INSTANCE_NOT_FOUND', `实例不存在: ${id}`, { id });
    const m = this.mounts.get(id);
    if (!m) throw new ThreedError('E_INSTANCE_NOT_FOUND', `实例未挂载: ${id}`, { id });
    const merged = { ...n.props, ...props } as Record<string, JsonValue>;
    const parsed = parseProps(m.def, merged, id); // 先校验（失败树不变）
    if (m.def.update) {
      m.def.update(m.object3d, m.props as never, parsed as never, this.ctxFor(m.tracker));
      m.props = parsed;
    } else {
      // 退化：unmount → remount（保持树位置）
      const parentObject = m.object3d.parent ?? this.threeScene;
      this.unmount(n);
      n.props = parsed as Record<string, JsonValue>;
      this.mounts.delete(id); // unmount 已删，防御
      this.ids.add(id); // unmount 删除过 id，恢复
      this.mount(n, parentObject);
    }
    n.props = parsed as Record<string, JsonValue>;
    if (n.type === CAMERA_TYPE) this.notifyCamera();
    this.notifyChange();
  }

  remove(id: string): void {
    const parent = this.findParent(id);
    const n = this.find(id);
    if (!n || !parent) throw new ThreedError('E_INSTANCE_NOT_FOUND', `实例不存在: ${id}`, { id });
    this.unmount(n); // 递归释放子树
    parent.children = parent.children.filter((c) => c.id !== id);
    if (this.cameraOverride === id) this.cameraOverride = null;
    if (n.type === CAMERA_TYPE || this.containsType(n, CAMERA_TYPE)) this.notifyCamera();
    this.notifyChange();
  }

  move(id: string, parentId: string, index?: number): void {
    const n = this.find(id);
    if (!n) throw new ThreedError('E_INSTANCE_NOT_FOUND', `实例不存在: ${id}`, { id });
    const newParent = this.find(parentId);
    if (!newParent) throw new ThreedError('E_INSTANCE_NOT_FOUND', `父实例不存在: ${parentId}`, { id: parentId });
    // 防环：目标父级不得位于被移动实例的子树内
    if (this.dfsFind(n, parentId)) {
      throw new ThreedError('E_TREE_TOO_DEEP', `非法移动：目标父级 ${parentId} 位于 ${id} 的子树内（树不允许环）`, { instanceId: id });
    }
    const oldParent = this.findParent(id)!;
    oldParent.children = oldParent.children.filter((c) => c.id !== id);
    const at = index === undefined ? newParent.children.length : Math.max(0, Math.min(index, newParent.children.length));
    newParent.children.splice(at, 0, n);
    const parentObject = this.mounts.get(parentId)?.object3d ?? this.threeScene;
    parentObject.add(this.mounts.get(id)!.object3d); // Object3D.add 自动从旧父级摘除
    this.notifyChange();
  }

  activeCameraId(): string | null {
    if (this.cameraOverride) return this.cameraOverride;
    const walk = (n: InstanceNodeData): string | null => {
      for (const c of n.children) {
        if (c.type === CAMERA_TYPE) return c.id;
        const r = walk(c);
        if (r) return r;
      }
      return null;
    };
    return walk(this.root);
  }

  activeCameraObject(): THREE.PerspectiveCamera | null {
    const id = this.activeCameraId();
    if (!id) return null;
    const m = this.mounts.get(id);
    return m ? (m.object3d as THREE.PerspectiveCamera) : null;
  }

  setActiveCamera(id: string): void {
    const n = this.find(id);
    if (!n) throw new ThreedError('E_INSTANCE_NOT_FOUND', `实例不存在: ${id}`, { id });
    if (n.type !== CAMERA_TYPE) {
      throw new ThreedError('E_PROPS_INVALID', `激活相机必须是 ${CAMERA_TYPE} 实例: ${id}`, { instanceId: id });
    }
    this.cameraOverride = id;
    this.notifyCamera();
  }

  /** 逃生舱支撑（T028）：按 ID 取实例的 Object3D（只读约定）。 */
  objectOf(id: string): THREE.Object3D | null {
    if (id === ROOT_ID) return this.threeScene;
    return this.mounts.get(id)?.object3d ?? null;
  }

  private notifyCamera(): void {
    this.onActiveCameraChange?.();
  }
  private containsType(n: InstanceNodeData, type: string): boolean {
    return n.children.some((c) => c.type === type || this.containsType(c, type));
  }
  private refOf(n: InstanceNodeData): InstanceRef {
    return Object.freeze({ id: n.id, type: n.type, props: Object.freeze({ ...n.props }) });
  }

  /** 全量释放（runtime.dispose 调用）。 */
  disposeAll(): void {
    this.unmount(this.root);
    this.root.children = [];
  }

  // ---- 序列化支撑（US3；与 serializer.ts 协作）----

  /** 文档形态树快照：内部根映射为固定 id 'root'（结构性节点），深拷贝、props 经契约补默认值。 */
  docTree(): DocumentNode {
    const groupDef = this.registry.get('core.group');
    const rootProps: JsonRecord = groupDef
      ? (parseProps(groupDef, this.root.props) as JsonRecord)
      : { ...this.root.props };
    return {
      id: DOC_ROOT_ID,
      type: 'core.group',
      props: rootProps,
      children: this.root.children.map((c) => this.cloneToDoc(c)),
    };
  }

  private cloneToDoc(n: InstanceNodeData): DocumentNode {
    return {
      id: n.id,
      type: n.type,
      props: JSON.parse(JSON.stringify(n.props)) as JsonRecord,
      children: n.children.map((c) => this.cloneToDoc(c)),
    };
  }

  /** 用文档树整体替换当前场景（deserialize 提交阶段；入参已通过 serializer 的纯校验）。 */
  replaceAll(tree: DocumentNode): void {
    for (const c of [...this.root.children]) this.unmount(c);
    this.root.children = [];
    this.cameraOverride = null;
    this.root.props = { ...tree.props } as Record<string, JsonValue>;
    for (const child of tree.children) this.ingest(this.root, child, 1);
    this.notifyCamera();
    this.notifyChange();
  }

  /** 文档节点挂载（id 允许系统/显式两种形态；深度/唯一性/单例强制）。 */
  private ingest(parent: InstanceNodeData, node: DocumentNode, depth: number): void {
    if (depth > MAX_DEPTH - 1) {
      throw new ThreedError('E_TREE_TOO_DEEP', `树深超过 ${MAX_DEPTH}`, { instanceId: node.id, depth: depth + 1 });
    }
    if (!/^(i[A-Za-z0-9]{11}|[A-Za-z][A-Za-z0-9_-]{0,63})$/.test(node.id)) {
      throw new ThreedError('E_ID_INVALID', `非法实例 ID: ${node.id}`, { id: node.id });
    }
    assertUniqueId(node.id, this.ids);
    const def = this.registry.get(node.type);
    if (!def) {
      throw new ThreedError('E_TYPE_UNKNOWN', `未注册的组件类型: ${node.type}`, { instanceId: node.id, type: node.type });
    }
    const dup = SINGLETON_RULES[node.type];
    if (dup && this.countType(node.type) >= 1) {
      throw new ThreedError(dup, `${node.type} 每文档至多一个`, { instanceId: node.id });
    }
    const parsed = parseProps(def, node.props, node.id);
    const data: InstanceNodeData = { id: node.id, type: node.type, props: parsed as Record<string, JsonValue>, children: [] };
    const parentObject = this.mounts.get(parent.id)?.object3d ?? this.threeScene;
    this.mount(data, parentObject);
    parent.children.push(data);
    this.ids.add(node.id);
    for (const c of node.children) this.ingest(data, c, depth + 1);
  }
}
