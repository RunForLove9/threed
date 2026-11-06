// T038：事件总线（FR-011/FR-021）——订阅过滤（全局/按 ID/按类型），无冒泡（仅命中实例派发 + 全局）。
export type InteractionEvent =
  | {
      type: 'pointerenter' | 'pointerleave' | 'pointerdown' | 'pointerup' | 'click';
      targetId: string;
      worldPoint: [number, number, number] | null;
      screenPoint: [number, number];
    }
  | { type: 'wheel'; targetId: string | null; screenPoint: [number, number]; deltaY: number }
  | { type: 'keydown' | 'keyup'; key: string; code: string } // 标准键值，无输入法/组合键语义
  | { type: 'camerachange'; cameraId: string }; // 粗粒度节流（默认 ≤10 次/秒），无逐帧增量载荷

export interface EventFilter {
  eventTypes?: string[];
  componentId?: string;
  componentType?: string;
}

export type EventHandler = (e: InteractionEvent) => void;

interface Sub {
  filter: EventFilter;
  handler: EventHandler;
}

export class EventBus {
  private subs = new Set<Sub>();

  subscribe(filter: EventFilter, handler: EventHandler): () => void {
    const sub: Sub = { filter, handler };
    this.subs.add(sub);
    return () => this.subs.delete(sub);
  }

  /** 派发（controller 调用；meta.targetType 供 componentType 过滤）。 */
  emit(e: InteractionEvent, meta?: { targetType?: string | null }): void {
    for (const sub of [...this.subs]) {
      const f = sub.filter;
      if (f.eventTypes && !f.eventTypes.includes(e.type)) continue;
      if (f.componentId && (e as { targetId?: string | null }).targetId !== f.componentId) continue;
      if (f.componentType && meta?.targetType !== f.componentType) continue;
      sub.handler(e);
    }
  }
}
