import { describe, it, expect } from 'vitest';
import * as sdk from '../src/index';

// T018 → T041：@threed/sdk 公共面全量审计（contracts/sdk-api.md）
// 泄漏纪律（FR-012）的运行时部分：值导出面精确匹配契约；three 类型只经 escape/组件编写面（类型层由 typecheck + d.ts 审计门禁保证）。

const EXPECTED_VALUE_EXPORTS = [
  'createRuntime',
  'defineComponent',
  'ThreedError',
  'isThreedError',
  'ERROR_CODES',
  'BUILTIN_TYPES',
  'CURRENT_SCHEMA_VERSION',
  'SDK_VERSION',
] as const;

describe('@threed/sdk 公共面审计', () => {
  it('值导出面与契约一致（不多不少）', () => {
    const actual = Object.keys(sdk).filter((k) => !k.startsWith('default')).sort();
    expect(actual).toEqual([...EXPECTED_VALUE_EXPORTS].sort());
  });

  it('错误码全集导出（contracts/sdk-api §6）', () => {
    expect(sdk.ERROR_CODES.length).toBeGreaterThanOrEqual(14);
    for (const c of ['E_PROPS_INVALID', 'E_TYPE_UNKNOWN', 'E_SCHEMA_FUTURE', 'E_RUNTIME_DISPOSED', 'E_PAYLOAD_TOO_LARGE', 'E_RENDER_FAILED']) {
      expect(sdk.ERROR_CODES).toContain(c);
    }
  });

  it('内置类型清单导出（12 组件）', () => {
    expect(sdk.BUILTIN_TYPES.length).toBe(12);
    expect(sdk.BUILTIN_TYPES).toContain('core.control.orbit');
  });

  it('schema 版本常量', () => {
    expect(sdk.CURRENT_SCHEMA_VERSION).toBe('1.0.0');
    expect(sdk.SDK_VERSION).toBe('0.1.0');
  });

  it('createRuntime / defineComponent 为函数（类型面由 typecheck 门禁覆盖）', () => {
    expect(typeof sdk.createRuntime).toBe('function');
    expect(typeof sdk.defineComponent).toBe('function');
  });
});
