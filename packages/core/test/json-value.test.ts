import { describe, it, expect } from 'vitest';
import { assertJsonValue, propPathOf } from '../src/component/json-value';

// T009（TDD）：props 值域 = JSON 兼容值递归（spec 澄清 Q3 / FR-004）
// 非法值必须在注册与写入时拒绝，并定位到 propPath。

describe('assertJsonValue 合法值', () => {
  it('接受全部 JSON 兼容值（含嵌套）', () => {
    expect(() => assertJsonValue(null)).not.toThrow();
    expect(() => assertJsonValue(true)).not.toThrow();
    expect(() => assertJsonValue(1.5)).not.toThrow();
    expect(() => assertJsonValue('s')).not.toThrow();
    expect(() => assertJsonValue([1, 'a', [2, { b: null }]])).not.toThrow();
    expect(() =>
      assertJsonValue({
        position: [0, 0, 0],
        material: { color: '#e8b04b', roughness: 0.4, wireframe: false },
      }),
    ).not.toThrow();
    expect(() => assertJsonValue({ empty: {}, emptyArr: [] })).not.toThrow();
  });

  it('拒绝非有限数字（NaN/Infinity——JSON 序列化会静默变 null，破坏往返）', () => {
    expect(() => assertJsonValue(NaN)).toThrowError(/NaN|非有限/);
    expect(() => assertJsonValue(Infinity)).toThrowError(/Infinity|非有限/);
    expect(() => assertJsonValue({ a: [1, -Infinity] })).toThrowError(/非有限|Infinity/);
  });
});

describe('assertJsonValue 非法值（必须拒绝 + 定位）', () => {
  const cases: Array<[string, unknown]> = [
    ['函数', () => 1],
    ['类实例 Date', new Date()],
    ['Map', new Map()],
    ['Set', new Set()],
    ['undefined', undefined],
    ['Symbol', Symbol('x')],
    ['bigint', 1n],
    ['循环引用对象', (() => { const o: Record<string, unknown> = {}; o.self = o; return o; })()],
    ['嵌套循环', (() => { const a: unknown[] = []; a.push({ a }); return a; })()],
    ['深处的函数', { material: { map: () => 1 } }],
  ];

  for (const [name, v] of cases) {
    it(`拒绝：${name}`, () => {
      let err: unknown;
      try {
        assertJsonValue(v);
      } catch (e) {
        err = e;
      }
      expect(err, `应当拒绝 ${name}`).toBeInstanceOf(Error);
      expect((err as { code?: string }).code).toBe('E_PROPS_INVALID');
    });
  }

  it('定位到 propPath（material.map）', () => {
    try {
      assertJsonValue({ material: { color: '#fff', map: () => 1 } });
      expect.unreachable();
    } catch (e) {
      expect((e as { details?: { propPath?: string } }).details?.propPath).toBe('material.map');
    }
  });
});

describe('propPathOf', () => {
  it('数组下标用 [n]，对象键用 .', () => {
    expect(propPathOf([])).toBe('');
    expect(propPathOf(['material', 0, 'color'])).toBe('material[0].color');
    expect(propPathOf(['children', 2, 'size'])).toBe('children[2].size');
  });
});
