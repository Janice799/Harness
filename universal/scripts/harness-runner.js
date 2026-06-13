#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function parseArgs(argv) {
  const args = {
    mode: null,
    check: null,
    pipeline: null,
    tag: null,
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
    else if (arg === '--pipeline') args.pipeline = argv[++index];
    else if (arg.startsWith('--pipeline=')) args.pipeline = arg.slice('--pipeline='.length);
    else if (arg === '--tag') args.tag = argv[++index];
    else if (arg.startsWith('--tag=')) args.tag = arg.slice('--tag='.length);
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
  node scripts/harness-runner.js --pipeline ci
  node scripts/harness-runner.js --tag smoke

Options:
  --mode <name>      Run checks listed in harness.config.json modes
  --check <id>       Run one check by id
  --pipeline <name>  Run an ordered pipeline
  --tag <tag>         Run checks containing a tag
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
    const selected = config.checks.filter((check) => check.id === args.check);
    return filterByTag(selected, args.tag);
  }

  const mode = args.mode || config.defaultMode || 'quick';
  const ids = config.modes?.[mode];
  if (!ids) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  const checksById = new Map(config.checks.map((check) => [check.id, check]));
  const selected = ids.map((id) => {
    const check = checksById.get(id);
    if (!check) throw new Error(`Mode references missing check: ${id}`);
    return check;
  });
  return filterByTag(selected, args.tag);
}

function selectPipeline(config, name) {
  const pipeline = config.pipelines?.[name];
  if (!pipeline) {
    throw new Error(`Unknown pipeline: ${name}`);
  }
  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    throw new Error(`Pipeline ${name} must contain at least one stage.`);
  }
  return pipeline.map((stage) => {
    if (!stage.name) {
      throw new Error(`Pipeline ${name} contains a stage without a name.`);
    }
    if (!stage.mode && !stage.check && !stage.tag) {
      throw new Error(`Pipeline stage ${stage.name} must define mode, check, or tag.`);
    }
    return {
      name: stage.name,
      failFast: stage.failFast !== false,
      checks: selectChecks(config, {
        mode: stage.mode || null,
        check: stage.check || null,
        tag: stage.tag || null,
      }),
    };
  });
}

function filterByTag(checks, tag) {
  if (!tag) return checks;
  return checks.filter((check) => Array.isArray(check.tags) && check.tags.includes(tag));
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

async function runChecks(rootDir, checks) {
  const results = [];
  for (const check of checks) {
    results.push(await runWithRetries(rootDir, check));
  }
  return results;
}

async function runPipeline(rootDir, config, name) {
  const stages = selectPipeline(config, name);
  const stageReports = [];
  let skipped = false;

  for (const stage of stages) {
    if (skipped) {
      stageReports.push({
        name: stage.name,
        status: 'skipped',
        failFast: stage.failFast,
        results: [],
      });
      continue;
    }

    console.log(`\n=== Pipeline stage: ${stage.name} ===`);
    const results = await runChecks(rootDir, stage.checks);
    const blockingFailures = results.filter(
      (result) => result.status !== 'pass' && result.required
    );
    const status = blockingFailures.length === 0 ? 'pass' : 'fail';

    stageReports.push({
      name: stage.name,
      status,
      failFast: stage.failFast,
      results,
    });

    if (status === 'fail' && stage.failFast) {
      skipped = true;
    }
  }

  return stageReports;
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
  const results = flattenResults(report);
  const passed = results.filter((result) => result.status === 'pass').length;
  const failed = results.length - passed;
  const label = report.pipeline ? `Pipeline ${report.pipeline}` : 'Harness';
  console.log(`\n${label} ${report.status.toUpperCase()}: ${passed} passed, ${failed} failed`);

  if (report.stages) {
    for (const stage of report.stages) {
      console.log(`\nStage ${stage.name}: ${stage.status.toUpperCase()}`);
      if (stage.status === 'skipped') continue;
      for (const result of stage.results) {
        printResult(result);
      }
    }
  } else {
    for (const result of results) {
      printResult(result);
    }
  }

  console.log(`\nReport: ${path.join(report.resultDir, 'latest.json')}`);
}

function flattenResults(report) {
  if (!report.stages) return report.results || [];
  return report.stages.flatMap((stage) => stage.results || []);
}

function printResult(result) {
  const marker = result.status === 'pass' ? 'PASS' : 'FAIL';
  const retryText = result.attemptCount > 1 ? ` after ${result.attemptCount} attempts` : '';
  console.log(`- ${marker} ${result.id}${retryText} (${result.durationMs}ms)`);
}

async function main() {
  const args = parseArgs(process.argv);
  const config = readConfig(args.root, args.config);

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const startedAt = new Date();
  let results = [];
  let stages = null;

  if (args.pipeline) {
    stages = await runPipeline(args.root, config, args.pipeline);
    results = stages.flatMap((stage) => stage.results);
  } else {
    const checks = selectChecks(config, args);
    if (checks.length === 0) {
      throw new Error('No checks selected.');
    }
    results = await runChecks(args.root, checks);
  }

  const endedAt = new Date();
  const blockingFailures = results.filter(
    (result) => result.status !== 'pass' && result.required
  );
  const skippedStages = stages?.filter((stage) => stage.status === 'skipped') || [];
  const report = {
    runId,
    mode: args.pipeline || args.check ? null : args.mode || config.defaultMode || 'quick',
    check: args.check,
    pipeline: args.pipeline,
    tag: args.tag,
    hook: args.hook,
    root: args.root,
    status: blockingFailures.length === 0 && skippedStages.length === 0 ? 'pass' : 'fail',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    resultDir: config.resultDir || 'harness/results',
    results,
    stages,
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
