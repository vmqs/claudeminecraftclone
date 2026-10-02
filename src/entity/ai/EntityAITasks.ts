import type { EntityAIBase } from './EntityAIBase';

interface EntityAITaskEntry {
  readonly priority: number;
  readonly action: EntityAIBase;
}

/**
 * A prioritised task list (EntityAITasks). Every third tick each task is re-evaluated (stop
 * the ones that can no longer run, start the ones that may); on the other ticks running tasks
 * are only asked whether to continue. Then every running task is updated.
 */
export class EntityAITasks {
  private readonly taskEntries: EntityAITaskEntry[] = [];
  private readonly executingTaskEntries: EntityAITaskEntry[] = [];
  private tickCount = 0;
  private readonly tickRate = 3;

  addTask(priority: number, action: EntityAIBase): void {
    this.taskEntries.push({ priority, action });
  }

  removeTask(action: EntityAIBase): void {
    for (let i = this.taskEntries.length - 1; i >= 0; i--) {
      const entry = this.taskEntries[i];
      if (entry.action !== action) continue;
      const running = this.executingTaskEntries.indexOf(entry);
      if (running >= 0) {
        action.resetTask();
        this.executingTaskEntries.splice(running, 1);
      }
      this.taskEntries.splice(i, 1);
    }
  }

  onUpdateTasks(): void {
    const started: EntityAITaskEntry[] = [];
    if (this.tickCount++ % this.tickRate === 0) {
      for (const entry of this.taskEntries) {
        const running = this.executingTaskEntries.indexOf(entry);
        if (running >= 0) {
          if (this.canUse(entry) && entry.action.continueExecuting()) continue;
          entry.action.resetTask();
          this.executingTaskEntries.splice(running, 1);
        }
        if (this.canUse(entry) && entry.action.shouldExecute()) {
          started.push(entry);
          this.executingTaskEntries.push(entry);
        }
      }
    } else {
      for (let i = this.executingTaskEntries.length - 1; i >= 0; i--) {
        const entry = this.executingTaskEntries[i];
        if (!entry.action.continueExecuting()) {
          entry.action.resetTask();
          this.executingTaskEntries.splice(i, 1);
        }
      }
    }
    for (const entry of started) entry.action.startExecuting();
    for (const entry of this.executingTaskEntries) entry.action.updateTask();
  }

  /** No running task blocks this one (same/higher priority sharing a bit, or uninterruptible). */
  private canUse(entry: EntityAITaskEntry): boolean {
    for (const other of this.taskEntries) {
      if (other === entry || !this.executingTaskEntries.includes(other)) continue;
      if (entry.priority >= other.priority) {
        if ((entry.action.getMutexBits() & other.action.getMutexBits()) !== 0) return false;
      } else if (!other.action.isInterruptible()) {
        return false;
      }
    }
    return true;
  }
}
