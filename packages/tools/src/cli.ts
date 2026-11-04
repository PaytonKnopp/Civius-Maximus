import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { contentFileJsonSchema, manifestJsonSchema } from '@cx/content';
import { compileFromDirs } from '@cx/content/node';
import { previewMap, runMapCheck } from './maps';
import { DEFAULT_BUDGET, formatRow, PROFILE_HEADER, checkProfile, runProfile } from './profile';
import { religionLine, runSimulation } from './simulate';
import { runValidate } from './validate';

const HELP = `Civius Maximus tools

Usage: pnpm cx <command> [args]

  validate [mod folders...]   Check the base game plus the given mods for mistakes
  schema [out folder]         Write JSON Schemas for editor autocompletion (default: schemas/)
  map [script] [size] [seed]  Print a generated map as text (default: continents duel 1)
  mapcheck [count] [sizes]    Generate and validate many maps per script (default: 1000, all sizes)
  simulate [players] [turns] [seed] [size] [script] [--afk]
                              Play an all-AI game and report on it (default: 4 150 1);
                              --afk makes p1 a player who only ends turns
  profile [players] [turns] [seed] [size] [script] [--every N] [--from save.json] [--save out.json] [--check]
                              Play an all-AI game and report turn time, save size, log size and
                              memory as it goes on (default: 8 150 1 standard). --from continues a
                              saved state for N more turns; --check fails if a budget is broken
`;

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'validate': {
    const { ok, lines } = runValidate(args.map((a) => resolve(a)));
    console.log(lines.join('\n'));
    process.exitCode = ok ? 0 : 1;
    break;
  }
  case 'schema': {
    const out = resolve(args[0] ?? 'schemas');
    mkdirSync(out, { recursive: true });
    writeFileSync(
      join(out, 'content-file.schema.json'),
      `${JSON.stringify(contentFileJsonSchema(), null, 2)}\n`,
    );
    writeFileSync(
      join(out, 'mod.schema.json'),
      `${JSON.stringify(manifestJsonSchema(), null, 2)}\n`,
    );
    console.log(`Wrote content-file.schema.json and mod.schema.json to ${out}`);
    break;
  }
  case 'map': {
    const content = compileFromDirs().content!;
    const [script = 'continents', size = 'duel', seed = '1'] = args;
    console.log(previewMap(content, script, size, seed).join('\n'));
    break;
  }
  case 'mapcheck': {
    const content = compileFromDirs().content!;
    const sizes = args[1]?.split(',');
    const { ok, lines } = runMapCheck(content, Number(args[0] ?? 1000), sizes);
    console.log(lines.join('\n'));
    process.exitCode = ok ? 0 : 1;
    break;
  }
  case 'simulate': {
    const content = compileFromDirs().content!;
    const afk = args.includes('--afk');
    const [players = '4', turns = '150', seed = '1', size, script] = args.filter(
      (a) => !a.startsWith('--'),
    );
    const r = runSimulation(
      content,
      {
        players: Number(players),
        turns: Number(turns),
        seed,
        ...(size ? { size } : {}),
        ...(script ? { script } : {}),
        afk,
        every: 10,
      },
      () => performance.now(),
    );
    console.log(r.lines.join('\n'));
    console.log(religionLine(r.state));
    console.log(`result: ${JSON.stringify(r.state.result)}`);
    console.log(`AI turn: average ${r.average.toFixed(1)} ms, slowest ${r.slowest.toFixed(0)} ms`);
    console.log(`events: ${JSON.stringify(r.events)}`);
    console.log(`refused actions: ${JSON.stringify(r.rejected)}`);
    break;
  }
  case 'profile': {
    const content = compileFromDirs().content!;
    const flag = (name: string) => {
      const i = args.indexOf(name);
      return i >= 0 ? args[i + 1] : undefined;
    };
    // Positional arguments are what is left once flags (and the value after each) are dropped.
    const positional = args.filter(
      (a, i) => !a.startsWith('--') && !['--every', '--from', '--save'].includes(args[i - 1] ?? ''),
    );
    const [players = '8', turns = '150', seed = '1', size = 'standard', script] = positional;
    const fromFile = flag('--from');
    const r = (() => {
      console.log(PROFILE_HEADER);
      return runProfile(
        content,
        {
          players: Number(players),
          turns: Number(turns),
          seed,
          size,
          ...(script ? { script } : {}),
          every: Number(flag('--every') ?? 25),
          ...(fromFile ? { from: JSON.parse(readFileSync(fromFile, 'utf8')) } : {}),
        },
        () => performance.now(),
        (row) => console.log(formatRow(row)),
      );
    })();
    const saveFile = flag('--save');
    if (saveFile) writeFileSync(saveFile, JSON.stringify(r.state));
    console.log(`result: ${JSON.stringify(r.state.result)}`);
    console.log(`slowest turn processing: ${r.slowestProcessMs.toFixed(0)} ms`);
    console.log(`final state hash: ${r.hash}`);
    if (args.includes('--check')) {
      const problems = checkProfile(r.rows, DEFAULT_BUDGET);
      for (const p of problems) console.log(`PROBLEM: ${p}`);
      console.log(problems.length ? 'profile check FAILED' : 'profile check passed');
      process.exitCode = problems.length ? 1 : 0;
    }
    break;
  }
  default:
    console.log(HELP);
    process.exitCode = command === undefined || command === 'help' ? 0 : 1;
}
