import { describe, it, expect } from 'vitest';
import {
  extractThreeVersions,
  assertSingleThreeVersion,
  readCatalogThreeVersion,
} from '../../scripts/check-three-version.mjs';

// T006 失败 fixture：多版本/错版本必须使门禁失败（先于实现验证的"必须红"用例）

const LOCK_SINGLE = `
snapshots:
  three@0.186.1: {}
`;
// @types/three 是类型包而非内核依赖，不得计入版本判定（真实场景：随 @types/three@0.186.0 安装出现）
const LOCK_WITH_TYPES = `
snapshots:
  '@types/three@0.186.0':
    dependencies: {}
  three@0.186.1: {}
`;
const LOCK_MULTI = `
snapshots:
  three@0.186.1: {}
  three@0.187.0:
    dependencies:
      '@ungap/structured-clone': 1.3.0
`;
const LOCK_WRONG = LOCK_SINGLE.replace(/0\.186\.1/g, '0.185.1');

describe('check-three-version 门禁（宪法 FR-001）', () => {
  it('单一锁定版本通过', () => {
    expect(extractThreeVersions(LOCK_SINGLE)).toEqual(new Set(['0.186.1']));
    expect(assertSingleThreeVersion(LOCK_SINGLE, '0.186.1')).toBe('0.186.1');
  });

  it('@types/three 不计入内核版本（0.186.0 类型包 + 0.186.1 内核 = 通过）', () => {
    expect(extractThreeVersions(LOCK_WITH_TYPES)).toEqual(new Set(['0.186.1']));
    expect(() => assertSingleThreeVersion(LOCK_WITH_TYPES, '0.186.1')).not.toThrow();
  });

  it('fixture：出现第二版本必须失败', () => {
    expect(() => assertSingleThreeVersion(LOCK_MULTI, '0.186.1')).toThrowError(/多个 three 版本.*0\.186\.1.*0\.187\.0|多个 three 版本.*0\.187\.0.*0\.186\.1/);
  });

  it('fixture：版本偏离 catalog 必须失败', () => {
    expect(() => assertSingleThreeVersion(LOCK_WRONG, '0.186.1')).toThrowError(/0\.185\.1/);
  });

  it('fixture：无 three 依赖必须失败', () => {
    expect(() => assertSingleThreeVersion('packages: {}', '0.186.1')).toThrowError(/未发现 three/);
  });

  it('从 workspace.yaml catalog 读取锁定版本（单一真源）', () => {
    const yaml = 'catalog:\n  three: 0.186.1\n  zod: ^4.6.7\n';
    expect(readCatalogThreeVersion(yaml)).toBe('0.186.1');
    expect(() => readCatalogThreeVersion('catalog:\n  zod: ^4.6.7\n')).toThrowError(/未找到 three/);
  });
});
