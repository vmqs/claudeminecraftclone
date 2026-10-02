import { Profiler } from '../client/Profiler';
import { CommandBase } from './CommandBase';
import { CommandException, WrongUsageException } from './CommandException';
import type { ICommandSender } from './ICommandSender';

const WITTY = [
  'Shiny numbers!',
  'Am I not running fast enough? :(',
  "I'm working as hard as I can!",
  'Will I ever be good enough for you? :(',
  'Speedy. Zoooooom!',
  'Hello world',
  '40% better than a crash report.',
  'Now with extra numbers',
  'Now with less numbers',
  'Now with the same numbers',
  'You should add flames to things, it makes them go faster!',
  'Do you feel the need for... optimization?',
  '*cracks redstone whip*',
  "Maybe if you treated it better then it'll have more motivation to work faster! Poor server.",
];

/** What /debug needs from the game: its tick profiler and tick counter. */
export const DebugHooks = {
  profiler: new Profiler(),
  getTickCounter: (): number => 0,
};

/**
 * /debug start|stop: profiles game ticks. The original wrote debug/profile-results-*.txt; here
 * the report goes to the browser console.
 */
export class CommandDebug extends CommandBase {
  private startTime = 0;
  private startTicks = 0;

  getCommandName(): string {
    return 'debug';
  }

  override getRequiredPermissionLevel(): number {
    return 3;
  }

  processCommand(sender: ICommandSender, args: string[]): void {
    const profiler = DebugHooks.profiler;
    if (args.length === 1) {
      if (args[0] === 'start') {
        CommandBase.notifyAdmins(sender, 'commands.debug.start');
        profiler.clearProfiling();
        profiler.profilingEnabled = true;
        this.startTime = Date.now();
        this.startTicks = DebugHooks.getTickCounter();
        return;
      }
      if (args[0] === 'stop') {
        if (!profiler.profilingEnabled) throw new CommandException('commands.debug.notStarted');
        const ms = Date.now() - this.startTime;
        const ticks = DebugHooks.getTickCounter() - this.startTicks;
        console.info(this.getProfilerResults(ms, ticks));
        profiler.profilingEnabled = false;
        CommandBase.notifyAdmins(sender, 'commands.debug.stop', Math.fround(ms / 1000), ticks);
        return;
      }
    }
    throw new WrongUsageException('commands.debug.usage');
  }

  private getProfilerResults(ms: number, ticks: number): string {
    let s = '---- Minecraft Profiler Results ----\n';
    s += '// ' + WITTY[Math.trunc(performance.now() * 1000) % WITTY.length] + '\n\n';
    s += `Time span: ${ms} ms\n`;
    s += `Tick span: ${ticks} ticks\n`;
    s += `// This is approximately ${(ticks / (ms / 1000)).toFixed(2)} ticks per second. It should be 20 ticks per second\n\n`;
    s += '--- BEGIN PROFILE DUMP ---\n\n';
    s += this.getProfileDump(0, 'root');
    s += '--- END PROFILE DUMP ---\n\n';
    return s;
  }

  private getProfileDump(depth: number, section: string): string {
    const data = DebugHooks.profiler.getProfilingData(section);
    if (!data || data.length < 3) return '';
    let s = '';
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      s += `[${String(depth).padStart(2, '0')}] ` + ' '.repeat(depth) + `${r.name} - ${r.sectionPercent.toFixed(2)}%/${r.globalPercent.toFixed(2)}%\n`;
      if (r.name !== 'unspecified') s += this.getProfileDump(depth + 1, section + '.' + r.name);
    }
    return s;
  }

  override addTabCompletionOptions(_sender: ICommandSender, args: string[]): string[] | null {
    return args.length === 1 ? CommandBase.getListOfStringsMatchingLastWord(args, 'start', 'stop') : null;
  }
}
