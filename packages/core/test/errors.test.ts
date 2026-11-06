import { describe, it, expect } from 'vitest';
import { ThreedError, type ThreedErrorCode, ERROR_CODES } from '../src/errors';

// T007（TDD）：结构化错误体系——形态与定位字段（data-model §5 / contracts/sdk-api §6）

describe('ThreedError 结构化错误', () => {
  it('错误码全集与契约一致', () => {
    expect([...ERROR_CODES].sort()).toEqual(
      [
        'E_PROPS_INVALID',
        'E_TYPE_UNKNOWN',
        'E_TYPE_DUPLICATE',
        'E_ID_INVALID',
        'E_ID_CONFLICT',
        'E_INSTANCE_NOT_FOUND',
        'E_ENV_DUPLICATE',
        'E_CONTROL_DUPLICATE',
        'E_SCHEMA_FUTURE',
        'E_DOC_MALFORMED',
        'E_TREE_TOO_DEEP',
        'E_RUNTIME_DISPOSED',
        'E_PAYLOAD_TOO_LARGE',
        'E_RENDER_FAILED',
      ].sort(),
    );
  });

  it('形态：name/code/message/details', () => {
    const e = new ThreedError('E_PROPS_INVALID', 'props 校验失败', {
      instanceId: 'iAbCdEfGhIjK',
      propPath: 'material.color',
    });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ThreedError');
    expect(e.code).toBe<ThreedErrorCode>('E_PROPS_INVALID');
    expect(e.message).toContain('E_PROPS_INVALID');
    expect(e.message).toContain('props 校验失败');
    expect(e.details).toEqual({ instanceId: 'iAbCdEfGhIjK', propPath: 'material.color' });
  });

  it('定位字段约定：E_SCHEMA_FUTURE 携带 requiredVersion', () => {
    const e = new ThreedError('E_SCHEMA_FUTURE', '数据版本高于运行时', { requiredVersion: '2.0.0' });
    expect(e.details?.requiredVersion).toBe('2.0.0');
  });

  it('定位字段约定：E_TREE_TOO_DEEP 携带 depth', () => {
    const e = new ThreedError('E_TREE_TOO_DEEP', '树深超限', { instanceId: 'ix1', depth: 65 });
    expect(e.details).toEqual({ instanceId: 'ix1', depth: 65 });
  });

  it('details 可省略（undefined 而非空对象）', () => {
    const e = new ThreedError('E_RUNTIME_DISPOSED', '运行时已销毁');
    expect(e.details).toBeUndefined();
  });

  it('可序列化为可读诊断信息（不含堆栈依赖）', () => {
    const e = new ThreedError('E_DOC_MALFORMED', '文档结构损坏', { path: '/tree/children/0' });
    expect(JSON.stringify(e.details)).toContain('/tree/children/0');
  });
});
