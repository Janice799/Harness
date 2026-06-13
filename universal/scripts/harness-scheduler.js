#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

function parseArgs(argv) {
  const args = {
    mode: 'quick',
    pipeline: null,
    check: null,
    tag: null,
    intervalMs: 30000,
    maxRuns: 0,
    root: process.cwd(),
    config: 'harness.config.json',
    compare: true,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') args.mode = argv[++index];
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length);
    else if (arg === '--pipeline') args.pipeline = argv[++index];
    else if (arg.startsWith('--pipeline=')) args.pipeline = arg.slice('--pipeline='.length);
    else if (arg === '--check') args.check = argv[++index];
    else if (arg.startsWith('--check=')) args.check = arg.slice('--check='.length);
    else if (arg === '--tag') args.tag = argv[++index];
    else if (arg.startsWith('--tag=')) args.tag = arg.slice('--tag='.length);
    else if (arg === '--interval') args.intervalMs = parseDuration(argv[++index]);
    else if (arg.startsWith('--interval=')) args.intervalMs = parseDuration(arg.slice('--interval='.length));
    else if (arg === '--max-runs') args.maxRuns = Number(argv[++index]);
    else if (arg.startsWith('--max-runs=')) args.maxRuns = Number(arg.slice('--max-runs='.length));
    else if (arg === '--root') args.root = argv[++index];
    else if (arg.startsWith('--root=')) args.root = arg.slice('--root='.length);
    else if (arg === '--config') args.config = argv[++index];
    else if (arg.startsWith('--config=')) args.config = arg.slice('--config='.length);
    else if (arg === '--no-compare') args.compare = false;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.intervalMs) || args.intervalMs <= 0) {
    throw new Error('Interval must be a positive duration.');
  }
  if (!Number.isFinite(args.maxRuns) || args.maxRuns < 0) {
    throw new Error('max-runs must be 0 or a positive number.');
  }

  args.root = path.resolve(process.cwd(), args.root);
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/harness-scheduler.js --interval 30s --mode quick
  node scripts/harness-scheduler.js --interval 1m --pipeline ci
  node scripts/harness-scheduler.js --interval 5s --max-runs 2

Options:
  --interval <duration>  Repeat interval, such as 30s, 1m, or 5000ms
  --mode <name>          Run a harness mode on each tick
  --pipeline <name>      Run a pipeline on each tick
  --check <id>           Run one check on each tick
  --tag <tag>            Filter selected checks by tag
  --max-runs <n>         Stop after n runs; 0 means run until stopped
  --no-compare           Do not compare latest with previous after each run
  --root <path>          Run from a custom project root
  --config <path>        Use a custom config path
`);
}

function parseDuration(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/);
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2] || 'ms';
  if (unit === 'ms') return amount;
  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60 * 1000;
  throw new Error(`Unsupported duration unit: ${unit}`);
}

function runnerArgs(args) {
  const out = ['scripts/harness-runner.js', '--config', args.config, '--summary'];
  if (args.pipeline) out.push('--pipeline', args.pipeline);
  else if (args.check) out.push('--check', args.check);
  else out.push('--mode', args.mode);
  if (args.tag) out.push('--tag', args.tag);
  return out;
}

function compareArgs(args) {
  return ['scripts/harness-runner.js', '--config', args.config, '--compare', 'latest', '--summary'];
}

function runNode(rootDir, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (code) => resolve(code || 0));
  });
}

async function runOnce(args, count) {
  const startedAt = new Date().toISOString();
  console.log(`\n[scheduler] run ${count} started at ${startedAt}`);
  const code = await runNode(args.root, runnerArgs(args));
  if (args.compare) {
    await runNode(args.root, compareArgs(args));
  }
  console.log(`[scheduler] run ${count} finished with exit code ${code}`);
  return code;
}

async function main() {
  const args = parseArgs(process.argv);
  let count = 0;
  let stopping = false;

  process.on('SIGINT', () => {
    stopping = true;
    console.log('\n[scheduler] stopping after current run');
  });
  process.on('SIGTERM', () => {
    stopping = true;
    console.log('\n[scheduler] stopping after current run');
  });

  console.log(`[scheduler] interval=${args.intervalMs}ms root=${args.root}`);

  while (!stopping) {
    count += 1;
    await runOnce(args, count);
    if (args.maxRuns > 0 && count >= args.maxRuns) break;
    if (stopping) break;
    await sleep(args.intervalMs);
  }

  console.log('[scheduler] stopped');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(`Scheduler error: ${error.message}`);
  process.exit(1);
});
