import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { contentFileJsonSchema, manifestJsonSchema } from '@cx/content';
import { compileFromDirs } from '@cx/content/node';
import { previewMap, runMapCheck } from './maps';
import { runValidate } from './validate';

const HELP = `Civius Maximus tools

Usage: pnpm cx <command> [args]

  validate [mod folders...]   Check the base game plus the given mods for mistakes
  schema [out folder]         Write JSON Schemas for editor autocompletion (default: schemas/)
  map [script] [size] [seed]  Print a generated map as text (default: continents duel 1)
  mapcheck [count] [sizes]    Generate and validate many maps per script (default: 1000, all sizes)
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
  default:
    console.log(HELP);
    process.exitCode = command === undefined || command === 'help' ? 0 : 1;
}
