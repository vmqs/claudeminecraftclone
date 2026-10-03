/**
 * One AI behaviour (EntityAIBase). Tasks run through EntityAITasks: a task may start when no
 * running task of the same or higher priority (lower number) shares a mutex bit with it, and a
 * running lower-priority task is interrupted when it is interruptible. Common mutex bits:
 * 1 = movement, 2 = looking, 4 = swimming/jumping.
 */
export abstract class EntityAIBase {
  private mutexBits = 0;

  abstract shouldExecute(): boolean;

  continueExecuting(): boolean {
    return this.shouldExecute();
  }

  isInterruptible(): boolean {
    return true;
  }

  startExecuting(): void {}

  resetTask(): void {}

  updateTask(): void {}

  setMutexBits(bits: number): void {
    this.mutexBits = bits;
  }

  getMutexBits(): number {
    return this.mutexBits;
  }
}
