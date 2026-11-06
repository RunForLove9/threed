// @threed/sdk —— 公共 API 门面（契约真源：contracts/sdk-api.md + component-authoring.md）
// 泄漏纪律（FR-012）：three 类型仅出现在逃生舱（RuntimeEscape）与组件编写面（ComponentDefinition/mount）。
export { createRuntime } from '@threed/core';
export { defineComponent } from '@threed/core';
export { ThreedError, isThreedError, ERROR_CODES } from '@threed/core';
export { BUILTIN_TYPES, CURRENT_SCHEMA_VERSION } from '@threed/core';
export { CORE_VERSION as SDK_VERSION } from '@threed/core';

// 类型面（随 .d.ts 发布——FR-013）
export type {
  Runtime,
  RuntimeOptions,
  RuntimeScene,
  RuntimeEscape,
  MetricsSource,
  MetricsSnapshot,
  SceneOperations,
  InstanceRef,
  InstanceNodeData,
  InteractionEvent,
  EventFilter,
  EventHandler,
  EscapeHatch,
  ComponentRegistry,
  ComponentDefinition,
  ComponentContext,
  ComponentCategory,
  SceneDocument,
  DocumentNode,
  JsonValue,
  JsonPath,
  ThreedErrorCode,
  ThreedErrorDetails,
} from '@threed/core';
