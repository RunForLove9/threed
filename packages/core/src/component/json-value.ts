// props 值域守卫（spec 澄清 Q3 / FR-004）：JSON 兼容值递归。
// 拒绝：function / class 实例 / Map / Set / undefined / Symbol / bigint / 循环引用 / 非有限数字。
// 非有限数字拒绝理由：JSON.stringify(NaN|Infinity) → null，会静默破坏序列化往返（FR-008）。
import { ThreedError, type ThreedErrorDetails } from '../errors';

export type JsonPath = (string | number)[];

export function propPathOf(path: JsonPath): string {
  return path.reduce<string>((acc, seg) =>
    typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg), '');
}

function fail(reason: string, path: JsonPath): never {
  const details: ThreedErrorDetails = { propPath: propPathOf(path) };
  throw new ThreedError('E_PROPS_INVALID', `${reason}（propPath: ${details.propPath || '<root>'}）`, details);
}

/** 就地校验 value 为 JSON 兼容值；违规抛 E_PROPS_INVALID 并定位 propPath。 */
export function assertJsonValue(value: unknown, path: JsonPath = [], seen = new WeakSet<object>()): void {
  const t = typeof value;
  if (value === null) return;
  if (t === 'boolean' || t === 'string') return;
  if (t === 'number') {
    if (!Number.isFinite(value)) fail(`非有限数字: ${String(value)}`, path);
    return;
  }
  if (value === undefined || t === 'undefined' || t === 'symbol' || t === 'bigint' || t === 'function') {
    fail(`非法值类型: ${t}`, path);
  }
  // object
  if (Array.isArray(value)) {
    if (seen.has(value)) fail('循环引用', path);
    seen.add(value);
    for (let i = 0; i < value.length; i++) assertJsonValue(value[i], [...path, i], seen);
    return;
  }
  if (value instanceof Map || value instanceof Set) fail('非法容器类型（Map/Set）', path);
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto !== Object.prototype && proto !== null) {
    fail(`类实例不允许作为 props 值（constructor: ${value.constructor?.name ?? 'unknown'}）`, path);
  }
  if (seen.has(value as object)) fail('循环引用', path);
  seen.add(value as object);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    assertJsonValue(v, [...path, k], seen);
  }
}

/** 类型层辅助：JSON 兼容值（仅供公共类型引用，运行时校验以 assertJsonValue 为准）。 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };
