import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { contentFileJsonSchema, manifestJsonSchema } from '@cx/content';
import { compileFromDirs } from '@cx/content/node';
import { previewMap, runMapCheck } from './maps';
import { DEFAULT_BUDGET, formatRow, PROFILE_HEADER, checkProfile, runProfile } from './profile';
import { religionLine, runSimulation } from './simulate';
import { runSoak, soakLine, soakMatrix, type SoakOptions, type SoakResult } from './soak';
import { runStats, type StatsOptions } from './stats';
import { statsPreset } from './statsPresets';
import { type GroupKey, summarizeStats } from './statsReport';
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
  stats <preset|matrix.json> [--out file.jsonl] [--jobs N]
                              Play many all-AI games (a preset from statsPresets.ts, or a JSON list of
                              game options) in parallel and write one line of measurements per game
  stats-one <options json>    Play one all-AI game and print its measurements as JSON
  stats-report <file.jsonl> [speed|size|difficulty|startEra|script|players|all]
                              Summarize measured games: pace, victories, yields over time, builds, choices
  soak <name|matrix.json> [--out file.jsonl] [--jobs N]
                              Play all-AI games to the end with the rules checked every turn (invariants,
                              save and load, promised yields); names: smoke, scripts, sizes, speeds,
                              difficulty, eras, options, seeds, all. Exits 1 if any game has a problem
  soak-one <options json>     Play one soak game and print its result as JSON
  profile [players] [turns] [seed] [size] [script] [--every N] [--from save.json] [--save out.json] [--check]
                              Play an all-AI game and report turn time, save size, log size and
                              memory as it goes on (default: 8 150 1 standard). --from continues a
                              saved state for N more turns; --check fails if a budget is broken
`;

const [command, ...args] = process.argv.slice(2);

/** Runs each game in its own process (`stats-one`), `jobs` at a time, appending results. */
async function runBatch(matrix: StatsOptions[], out: string, jobs: number) {
  const { spawn } = await import('node:child_process');
  const { appendFileSync } = await import('node:fs');
  const tsx = resolve('node_modules/.bin/tsx');
  const cli = resolve('packages/tools/src/cli.ts');
  let next = 0;
  let done = 0;
  const started = Date.now();
  const worker = async () => {
    while (next < matrix.length) {
      const o = matrix[next++]!;
      const label = JSON.stringify(o);
      const t0 = Date.now();
      const line = await new Promise<string>((ok) => {
        const child = spawn(tsx, [cli, 'stats-one', label], { stdio: ['ignore', 'pipe', 'pipe'] });
        let buf = '';
        let err = '';
        child.stdout.on('data', (d) => (buf += d));
        child.stderr.on('data', (d) => (err += d));
        child.on('close', (code) => {
          if (code !== 0) console.error(`FAILED ${label}: ${err.slice(-2000)}`);
          ok(code === 0 ? buf.trim() : '');
        });
      });
      done++;
      if (line) {
        appendFileSync(out, `${line}\n`);
        const g = JSON.parse(line);
        console.log(
          `[${done}/${matrix.length}] ${((Date.now() - t0) / 1000).toFixed(0)}s ${label} -> ${g.result?.reason ?? '-'} turn ${g.endTurn}`,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  console.log(`wrote ${out} in ${((Date.now() - started) / 60000).toFixed(1)} min`);
}

/**
 * Runs each soak game in its own process (`soak-one`), `jobs` at a time; true if all were sound.
 * With an `out` file that already holds results, the games in it (by seed) are not played again,
 * so a long soak that was cut short picks up where it stopped.
 */
async function runSoakBatch(all: SoakOptions[], out: string | undefined, jobs: number) {
  const { spawn } = await import('node:child_process');
  const { appendFileSync, existsSync } = await import('node:fs');
  const earlier: SoakResult[] =
    out && existsSync(out)
      ? readFileSync(out, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l) as SoakResult)
      : [];
  const played = new Set(earlier.map((r) => r.config.seed));
  const matrix = all.filter((o) => !played.has(o.seed));
  if (earlier.length > 0)
    console.log(`${earlier.length} games already in ${out}; ${matrix.length} still to play`);
  const tsx = resolve('node_modules/.bin/tsx');
  const cli = resolve('packages/tools/src/cli.ts');
  let next = 0;
  let done = 0;
  let bad = earlier.filter((r) => r.problemCount > 0).length;
  let turns = earlier.reduce((n, r) => n + r.endTurn, 0);
  const rejected: Record<string, number> = {};
  for (const r of earlier)
    for (const [k, n] of Object.entries(r.rejected)) rejected[k] = (rejected[k] ?? 0) + n;
  const started = Date.now();
  const worker = async () => {
    while (next < matrix.length) {
      const o = matrix[next++]!;
      const label = JSON.stringify(o);
      const line = await new Promise<string>((ok) => {
        const child = spawn(tsx, [cli, 'soak-one', label], { stdio: ['ignore', 'pipe', 'pipe'] });
        let buf = '';
        let err = '';
        child.stdout.on('data', (d) => (buf += d));
        child.stderr.on('data', (d) => (err += d));
        child.on('close', (code) => {
          if (code !== 0) console.log(`BAD ${label}: the process died: ${err.slice(-1500)}`);
          ok(code === 0 ? buf.trim() : '');
        });
      });
      done++;
      if (!line) {
        bad++;
        continue;
      }
      if (out) appendFileSync(out, `${line}\n`);
      const r = JSON.parse(line) as SoakResult;
      if (r.problemCount > 0) bad++;
      turns += r.endTurn;
      for (const [k, n] of Object.entries(r.rejected)) rejected[k] = (rejected[k] ?? 0) + n;
      console.log(`[${done}/${matrix.length}] ${soakLine(r).join('\n')}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  const top = Object.entries(rejected)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
  console.log(
    `${all.length} games, ${turns} turns, ${bad} with problems, in ${((Date.now() - started) / 60000).toFixed(1)} min`,
  );
  console.log(`refused AI actions: ${top || 'none'}`);
  return bad === 0;
}

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
  case 'stats-one': {
    const content = compileFromDirs().content!;
    const o = JSON.parse(args[0] ?? '{}') as StatsOptions;
    console.log(JSON.stringify(runStats(content, o)));
    break;
  }
  case 'stats': {
    const flag = (name: string) => {
      const i = args.indexOf(name);
      return i >= 0 ? args[i + 1] : undefined;
    };
    const spec = args[0] ?? 'smoke';
    const matrix: StatsOptions[] = spec.endsWith('.json')
      ? JSON.parse(readFileSync(spec, 'utf8'))
      : statsPreset(spec);
    const out = flag('--out') ?? `stats-${spec.replace(/\W+/g, '_')}.jsonl`;
    const jobs = Number(flag('--jobs') ?? 4);
    await runBatch(matrix, out, jobs);
    break;
  }
  case 'soak-one': {
    const content = compileFromDirs().content!;
    const o = JSON.parse(args[0] ?? '{}') as SoakOptions;
    console.log(JSON.stringify(runSoak(content, o)));
    break;
  }
  case 'soak': {
    const flag = (name: string) => {
      const i = args.indexOf(name);
      return i >= 0 ? args[i + 1] : undefined;
    };
    const spec = args[0] ?? 'smoke';
    const matrix: SoakOptions[] = spec.endsWith('.json')
      ? JSON.parse(readFileSync(spec, 'utf8'))
      : soakMatrix(spec);
    const ok = await runSoakBatch(matrix, flag('--out'), Number(flag('--jobs') ?? 3));
    process.exitCode = ok ? 0 : 1;
    break;
  }
  case 'stats-report': {
    const content = compileFromDirs().content!;
    const lines = readFileSync(args[0]!, 'utf8').split('\n').filter(Boolean);
    const games = lines.map((l) => JSON.parse(l));
    console.log(summarizeStats(games, (args[1] ?? 'speed') as GroupKey, content).join('\n'));
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
