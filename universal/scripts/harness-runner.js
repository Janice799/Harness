#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function parseArgs(argv) {
  const args = {
    mode: null,
    check: null,
    json: false,
    hook: false,
    config: 'harness.config.json',
    root: process.cwd(),
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--hook') args.hook = true;
    else if (arg === '--mode') args.mode = argv[++index];
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length);
    else if (arg === '--check') args.check = argv[++index];
    else if (arg.startsWith('--check=')) args.check = arg.slice('--check='.length);
    else if (arg === '--config') args.config = argv[++index];
    else if (arg.startsWith('--config=')) args.config = arg.slice('--config='.length);
    else if (arg === '--root') args.root = argv[++index];
    else if (arg.startsWith('--root=')) args.root = arg.slice('--root='.length);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.root = path.resolve(process.cwd(), args.root);
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/harness-runner.js --mode quick
  node scripts/harness-runner.js --mode full --json
  node scripts/harness-runner.js --check smoke

Options:
  --mode <name>      Run checks listed in harness.config.json modes
  --check <id>       Run one check by id
  --json             Print the full JSON report
  --config <path>    Use a custom config path
  --root <path>      Run from a custom project root
`);
}

function readConfig(rootDir, configPath) {
  const absolutePath = path.resolve(rootDir, configPath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  return JSON.parse(text);
}

function selectChecks(config, args) {
  if (args.check) {
    return config.checks.filter((check) => check.id === args.check);
  }

  const mode = args.mode || config.defaultMode || 'quick';
  const ids = config.modes?.[mode];
  if (!ids) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  const checksById = new Map(config.checks.map((check) => [check.id, check]));
  return ids.map((id) => {
    const check = checksById.get(id);
    if (!check) throw new Error(`Mode references missing check: ${id}`);
    return check;
  });
}

function runCommand(rootDir, check) {
  return new Promise((resolve) => {
    const startedAt = new Date();
    const timeoutMs = check.timeoutMs || 600000;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(check.command, {
      cwd: rootDir,
      shell: true,
      env: process.env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const endedAt = new Date();
      resolve({
        id: check.id,
        name: check.name || check.id,
        command: check.command,
        required: check.required !== false,
        status: code === 0 && !timedOut ? 'pass' : 'fail',
        exitCode: code,
        signal,
        timedOut,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
      });
    });
  });
}

async function runWithRetries(rootDir, check) {
  const maxAttempts = (check.retries || 0) + 1;
  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`\n[${check.id}] attempt ${attempt}/${maxAttempts}: ${check.command}`);
    const result = await runCommand(rootDir, check);
    attempts.push(result);
    if (result.status === 'pass') break;
  }

  const final = attempts[attempts.length - 1];
  return {
    ...final,
    attempts,
    attemptCount: attempts.length,
  };
}

function trimOutput(value) {
  const maxLength = 12000;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n... output truncated ...`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeReport(rootDir, config, report) {
  const resultDir = path.resolve(rootDir, config.resultDir || 'harness/results');
  ensureDir(resultDir);
  const timestampPath = path.join(resultDir, `${report.runId}.json`);
  const latestPath = path.join(resultDir, 'latest.json');
  const text = `${JSON.stringify(report, null, 2)}\n`;
  fs.writeFileSync(timestampPath, text);
  fs.writeFileSync(latestPath, text);
}

function summarize(report) {
  const passed = report.results.filter((result) => result.status === 'pass').length;
  const failed = report.results.length - passed;
  console.log(`\nHarness ${report.status.toUpperCase()}: ${passed} passed, ${failed} failed`);

  for (const result of report.results) {
    const marker = result.status === 'pass' ? 'PASS' : 'FAIL';
    const retryText = result.attemptCount > 1 ? ` after ${result.attemptCount} attempts` : '';
    console.log(`- ${marker} ${result.id}${retryText} (${result.durationMs}ms)`);
  }

  console.log(`\nReport: ${path.join(report.resultDir, 'latest.json')}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const config = readConfig(args.root, args.config);
  const checks = selectChecks(config, args);

  if (checks.length === 0) {
    throw new Error('No checks selected.');
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const startedAt = new Date();
  const results = [];

  for (const check of checks) {
    results.push(await runWithRetries(args.root, check));
  }

  const endedAt = new Date();
  const blockingFailures = results.filter(
    (result) => result.status !== 'pass' && result.required
  );

  const report = {
    runId,
    mode: args.check ? null : args.mode || config.defaultMode || 'quick',
    check: args.check,
    hook: args.hook,
    root: args.root,
    status: blockingFailures.length === 0 ? 'pass' : 'fail',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    resultDir: config.resultDir || 'harness/results',
    results,
  };

  writeReport(args.root, config, report);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    summarize(report);
  }

  process.exit(report.status === 'pass' ? 0 : 1);
}

main().catch((error) => {
  console.error(`Harness error: ${error.message}`);
  process.exit(1);
});
