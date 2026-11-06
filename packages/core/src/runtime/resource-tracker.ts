// T015：资源记账（FR-016）——mount 产生的 GPU 资源统一登记，dispose 清单化释放。
// 逃生舱交出所有权的对象不入账（所有权边界见 contracts/sdk-api §5）。

export interface Disposable {
  dispose(): void;
}

export class ResourceTracker {
  private items = new Set<Disposable>();

  get size(): number {
    return this.items.size;
  }

  /** 登记并原样返回（便于 `tracker.track(new THREE.BoxGeometry(...))` 内联写法）。 */
  track<T extends Disposable>(d: T): T {
    this.items.add(d);
    return d;
  }

  untrack(d: Disposable): void {
    this.items.delete(d);
  }

  /** 释放全部登记资源；幂等，单项 dispose 异常不阻断其余释放。 */
  disposeAll(): void {
    for (const d of [...this.items]) {
      this.items.delete(d);
      try {
        d.dispose();
      } catch {
        // 单项失败不阻断清单化释放
      }
    }
  }
}
