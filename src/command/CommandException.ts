/** A command failure shown in red; the message is a translation key formatted with `errorObjects`. */
export class CommandException extends Error {
  readonly errorObjects: unknown[];

  constructor(key: string, ...args: unknown[]) {
    super(key);
    this.errorObjects = args;
  }
}

export class SyntaxErrorException extends CommandException {
  constructor(key = 'commands.generic.syntax', ...args: unknown[]) {
    super(key, ...args);
  }
}

/** Shown as "Usage: <translated usage>". */
export class WrongUsageException extends SyntaxErrorException {}

export class NumberInvalidException extends CommandException {
  constructor(key = 'commands.generic.num.invalid', ...args: unknown[]) {
    super(key, ...args);
  }
}

export class PlayerNotFoundException extends CommandException {
  constructor(key = 'commands.generic.player.notFound', ...args: unknown[]) {
    super(key, ...args);
  }
}

export class CommandNotFoundException extends CommandException {
  constructor(key = 'commands.generic.notFound', ...args: unknown[]) {
    super(key, ...args);
  }
}
