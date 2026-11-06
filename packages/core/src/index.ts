// @threed/core —— 运行时内核（内部包；公共 API 面唯一出口是 @threed/sdk）
// 泄漏纪律（FR-012）：除 escape 外的导出不得出现 three 类型。

// errors（公共契约：错误码全集）
export { ThreedError, isThreedError, ERROR_CODES } from './errors';
export type { ThreedErrorCode, ThreedErrorDetails } from './errors';

// runtime（US1 + US2 集成）
export { createRuntime, disposedGuard } from './runtime/runtime';
export type { Runtime, RuntimeEscape, RuntimeScene, MetricsSource } from './runtime/runtime';
export { normalizeOptions } from './runtime/options';
export type { RuntimeOptions, NormalizedOptions } from './runtime/options';
export { ResourceTracker } from './runtime/resource-tracker';
export type { Disposable } from './runtime/resource-tracker';
export type { EscapeHatch } from './runtime/escape';

// component（US2）
export { ComponentRegistry, defineComponent, parseProps } from './component/registry';
export type { ComponentDefinition, ComponentContext, ComponentCategory } from './component/registry';
export { BUILTIN_TYPES, registerBuiltinComponents } from './component/builtins';

// scene（US2）
export { SceneGraph } from './scene/scene-graph';
export type { SceneOperations, InstanceRef, InstanceNodeData } from './scene/scene-graph';

// interaction（US4）
export { EventBus } from './interaction/events';
export type { InteractionEvent, EventFilter, EventHandler } from './interaction/events';

// metrics（US1）
export { createMetricsRecorder } from './metrics/metrics';
export type { MetricsSnapshot, MetricsRecorder, RendererInfoLike } from './metrics/metrics';

// component（US2+）：json-value 守卫（props 值域）
export { assertJsonValue, propPathOf } from './component/json-value';
export type { JsonValue, JsonPath } from './component/json-value';

// schema（US1 基础件）：实例 ID
export { generateSystemId, validateExplicitId, assertUniqueId, isSystemId } from './schema/id';

// schema（US3）：SceneDocument 序列化
export { serializeGraph, deserializeIntoGraph, CURRENT_SCHEMA_VERSION } from './schema/serializer';
export { migrateDocument, registerMigration, assertReadableVersion } from './schema/versioning';
export { sceneDocumentSchema, documentJsonSchema } from './schema/document';
export type { SceneDocument, DocumentNode, JsonRecord } from './schema/document';

export const CORE_VERSION = '0.1.0';
