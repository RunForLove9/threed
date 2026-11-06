// 结构化错误体系（data-model §5 / contracts/sdk-api §6）
// 错误码本身是公共契约：新增 = MINOR，改义/删除 = MAJOR。
export type ThreedErrorCode =
  | 'E_PROPS_INVALID' // props 类型不符/越界/多余字段（details: instanceId, propPath）
  | 'E_TYPE_UNKNOWN' // 未注册类型或 asset.* 预留类型（details: instanceId?, type）
  | 'E_TYPE_DUPLICATE' // 重复注册组件类型（details: type；覆盖需显式 override）
  | 'E_ID_INVALID' // ID 格式非法（details: id）
  | 'E_ID_CONFLICT' // ID 文档内冲突（details: id）
  | 'E_INSTANCE_NOT_FOUND' // 按 ID 定点操作目标不存在（details: id）
  | 'E_ENV_DUPLICATE' // 第二个 core.environment（details: instanceId）
  | 'E_CONTROL_DUPLICATE' // 第二个 core.control.orbit（details: instanceId）
  | 'E_SCHEMA_FUTURE' // 数据版本高于运行时（details: requiredVersion）
  | 'E_DOC_MALFORMED' // 文档结构损坏/被篡改（details: path?）
  | 'E_TREE_TOO_DEEP' // 树深超过 64（details: instanceId, depth）
  | 'E_RUNTIME_DISPOSED' // dispose 后的公共调用
  | 'E_PAYLOAD_TOO_LARGE' // http 请求体超上限
  | 'E_RENDER_FAILED'; // 渲染管线意外失败（http）

export const ERROR_CODES: readonly ThreedErrorCode[] = [
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
];

export interface ThreedErrorDetails {
  instanceId?: string;
  propPath?: string;
  id?: string;
  type?: string;
  depth?: number;
  requiredVersion?: string;
  path?: string;
  [k: string]: unknown;
}

export class ThreedError extends Error {
  readonly code: ThreedErrorCode;
  readonly details?: ThreedErrorDetails;

  constructor(code: ThreedErrorCode, message: string, details?: ThreedErrorDetails) {
    super(`[${code}] ${message}`);
    this.name = 'ThreedError';
    this.code = code;
    this.details = details;
  }
}

export function isThreedError(e: unknown): e is ThreedError {
  return e instanceof ThreedError;
}
