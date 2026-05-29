/**
 * argv → {@link Command} parser for the chrome-use CLI.
 *
 * The first token is the subcommand (alias-normalized). Remaining tokens split
 * into positional `args` and `flags`. Boolean flags never consume a following
 * token; every other long/short flag consumes the next token as its value.
 */
import type { Command } from './types.ts';

/** Subcommand aliases → canonical name. */
export const ALIASES: Record<string, string> = {
  goto: 'open',
  navigate: 'open',
  url: 'open', // note: "get url" is handled by the get subcommand, not here
  quit: 'close',
  exit: 'close',
  shot: 'screenshot',
  evaluate: 'eval',
  cookie: 'cookies',
  tabs: 'tab',
};

/** Flags that are booleans (never consume a following value). Stored by long name. */
const BOOLEAN_FLAGS = new Set(['i', 'full', 'json', 'new-tab', 'all']);

/** Short flag → long flag name (without dashes). */
const SHORT_FLAGS: Record<string, string> = {
  i: 'interactive',
  s: 'selector',
};

/** Boolean short flags map to their long name as a boolean too. */
const SHORT_IS_BOOLEAN = new Set(['i']);

/** Parse process.argv.slice(2) into a Command. */
export function parseArgv(argv: string[]): Command {
  if (argv.length === 0) return { name: 'help', args: [], flags: {} };

  const rawName = argv[0];
  const name = ALIASES[rawName] ?? rawName;
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];

    if (token.startsWith('--')) {
      const key = token.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
      } else if (i + 1 < argv.length) {
        flags[key] = argv[++i];
      } else {
        flags[key] = true;
      }
      continue;
    }

    if (token.startsWith('-') && token.length > 1) {
      const short = token.slice(1);
      const long = SHORT_FLAGS[short] ?? short;
      if (BOOLEAN_FLAGS.has(short) || SHORT_IS_BOOLEAN.has(short)) {
        flags[long] = true;
      } else if (i + 1 < argv.length) {
        flags[long] = argv[++i];
      } else {
        flags[long] = true;
      }
      continue;
    }

    args.push(token);
  }

  return { name, args, flags };
}
