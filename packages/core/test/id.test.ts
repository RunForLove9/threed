import { describe, it, expect } from 'vitest';
import { generateSystemId, validateExplicitId, assertUniqueId, isSystemId } from '../src/schema/id';

// T008（TDD）：实例 ID 生成与校验（research R6 / FR-020）

describe('系统分配 ID', () => {
  it('格式：i + 11 位 base36', () => {
    for (let i = 0; i < 1000; i++) {
      const id = generateSystemId();
      expect(id).toMatch(/^i[A-Za-z0-9]{11}$/);
    }
  });

  it('批量唯一性（10k 无冲突）', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const id = generateSystemId();
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('isSystemId 识别', () => {
    expect(isSystemId(generateSystemId())).toBe(true);
    expect(isSystemId('abc')).toBe(false);
  });
});

describe('显式指定 ID（^[A-Za-z][A-Za-z0-9_-]{0,63}$）', () => {
  it('合法值通过', () => {
    for (const id of ['a', 'my-box', 'Node_1', 'A' + 'b'.repeat(63)]) {
      expect(() => validateExplicitId(id)).not.toThrow();
    }
  });

  it('非法值拒绝并携带 E_ID_INVALID + id', () => {
    for (const bad of ['1abc', 'a b', 'a.b', 'ábc', '', 'a'.repeat(65), 'i12345678901']) {
      // 注意：显式通道不允许伪装成系统 ID 形态（i+11位）——避免与系统生成空间歧义
      let err: unknown;
      try {
        validateExplicitId(bad);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(Error);
      expect((err as { code?: string }).code).toBe('E_ID_INVALID');
      expect((err as { details?: { id?: string } }).details?.id).toBe(bad);
    }
  });
});

describe('文档内唯一性（FR-020）', () => {
  it('冲突抛 E_ID_CONFLICT 并携带 id', () => {
    const existing = new Set(['iAbCdEfGhIjK', 'user-node-1']);
    expect(() => assertUniqueId('user-node-1', existing)).toThrowError(/E_ID_CONFLICT/);
    try {
      assertUniqueId('user-node-1', existing);
    } catch (e) {
      expect((e as { details?: { id?: string } }).details?.id).toBe('user-node-1');
    }
    expect(() => assertUniqueId('user-node-2', existing)).not.toThrow();
  });
});
