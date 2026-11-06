// T023：组件注册表（FR-004 / contracts/component-authoring.md）
// 泄漏说明：defineComponent 生命周期挂钩是公共面中除逃生舱外唯一接触 three 类型的扩展点（组件作者面）。
import * as THREE from 'three';
import { z } from 'zod';
import { ThreedError } from '../errors';
import type { JsonValue } from './json-value';

export type ComponentCategory =
  | 'primitive'
  | 'group'
  | 'light'
  | 'camera'
  | 'environment'
  | 'interaction';

/** mount 上下文：资源记账（实例级 tracker）+ 场景根 + 当前视口宽高比。 */
export interface ComponentContext {
  track<T extends { dispose(): void }>(d: T): T;
  scene: THREE.Scene;
  aspect: number;
}

export interface ComponentInstanceRef {
  id: string;
  props: Record<string, JsonValue>;
}

export interface ComponentDefinition<S extends z.ZodType = z.ZodType> {
  /** 唯一类型标识；`core.*` 内置保留、`asset.*` 预留（第三方注册两前缀均拒绝） */
  type: string;
  category: ComponentCategory;
  /** props 契约（zod，字段类型 + 默认值；strict：多余字段拒绝） */
  props: S;
  /** 实例数据 → three 子树（纯数据进、渲染树出：MUST NOT 读取隐藏运行时状态——宪法 III） */
  mount(instance: { id: string; props: z.infer<S> }, ctx: ComponentContext): THREE.Object3D;
  /** props 变更增量应用；可省略（退化为 remount）；必须幂等 */
  update?(object3d: THREE.Object3D, prev: z.infer<S>, next: z.infer<S>, ctx: ComponentContext): void;
  /** 释放 mount 产物中经 ctx.track 之外的资源；幂等 */
  dispose?(object3d: THREE.Object3D): void;
}

export function defineComponent<S extends z.ZodType>(def: ComponentDefinition<S>): ComponentDefinition<S> {
  return def;
}

const RESERVED_PREFIXES = ['core.', 'asset.'];

export class ComponentRegistry {
  private defs = new Map<string, ComponentDefinition>();

  /** 注册；internal 仅供底座预装内置组件（允许 core. 前缀）。 */
  register(def: ComponentDefinition, opts?: { override?: boolean; internal?: boolean }): void {
    if (typeof def?.type !== 'string' || def.type.length === 0) {
      throw new ThreedError('E_TYPE_UNKNOWN', `非法类型标识: ${String(def?.type)}`, { type: String(def?.type) });
    }
    if (!opts?.internal && RESERVED_PREFIXES.some((p) => def.type.startsWith(p))) {
      throw new ThreedError(
        'E_TYPE_UNKNOWN',
        `保留命名空间不允许第三方注册: ${def.type}（core.* 内置 / asset.* 预留——spec 澄清 Q2）`,
        { type: def.type },
      );
    }
    if (this.defs.has(def.type) && !opts?.override) {
      throw new ThreedError('E_TYPE_DUPLICATE', `组件类型已注册: ${def.type}（覆盖需显式 override: true）`, { type: def.type });
    }
    this.defs.set(def.type, def);
  }

  has(type: string): boolean {
    return this.defs.has(type);
  }

  get(type: string): ComponentDefinition | undefined {
    return this.defs.get(type);
  }

  list(): ReadonlyArray<{ type: string; category: ComponentCategory }> {
    return [...this.defs.values()]
      .map((d) => ({ type: d.type, category: d.category }))
      .sort((a, b) => a.type.localeCompare(b.type));
  }
}

/** 按 props 契约解析（默认值填充 + strict 拒绝多余字段）；失败抛 E_PROPS_INVALID 并定位 propPath。 */
export function parseProps<S extends z.ZodType>(
  def: ComponentDefinition<S>,
  raw: unknown,
  instanceId?: string,
): z.infer<S> {
  const result = def.props.safeParse(raw ?? {});
  if (!result.success) {
    const issue = result.error.issues[0]!;
    let propPath = issue.path.map(String).join('.');
    // zod4：strict 未知键错误的 path 为空，键名在 message 中（Unrecognized key: "x"）
    if (!propPath) {
      const m = /["']([^"']+)["']/.exec(issue.message);
      propPath = m ? (m[1] as string) : '(root)';
    }
    throw new ThreedError('E_PROPS_INVALID', `props 校验失败（${def.type}）: ${issue.message}`, {
      instanceId,
      propPath,
    });
  }
  return result.data as z.infer<S>;
}
