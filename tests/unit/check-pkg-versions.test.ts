import { describe, it, expect } from 'vitest';
import { assertSameVersions } from '../../scripts/check-pkg-versions.mjs';

// T047 失败 fixture：版本漂移必须使门禁失败（先于实现验证的"必须红"用例）

describe('check-pkg-versions 门禁（FR-017）', () => {
  it('三包同号通过', () => {
    expect(
      assertSameVersions({ '@threed/core': '0.1.0', '@threed/sdk': '0.1.0', '@threed/http': '0.1.0' }),
    ).toBe('0.1.0');
  });

  it('fixture：任一包漂移必须失败并列出各包版本', () => {
    expect(() =>
      assertSameVersions({ '@threed/core': '0.1.0', '@threed/sdk': '0.1.1', '@threed/http': '0.1.0' }),
    ).toThrowError(/版本漂移.*0\.1\.1/);
  });

  it('fixture：空输入失败', () => {
    expect(() => assertSameVersions({})).toThrowError(/未读取/);
  });
});
