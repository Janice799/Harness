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
    compare: null,
    history: false,
    failuresOnly: false,
    summary: false,
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
    else if (arg === '--compare') args.compare = argv[++index] || 'latest';
    else if (arg.startsWith('--compare=')) args.compare = arg.slice('--compare='.length);
    else if (arg === '--history') args.history = true;
    else if (arg === '--failures-only') args.failuresOnly = true;
    else if (arg === '--summary') args.summary = true;
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
  node scripts/harness-runner.js --history
  node scripts/harness-runner.js --compare latest

Options:
  --mode <name>      Run checks listed in harness.config.json modes
  --check <id>       Run one check by id
  --pipeline <name>  Run an ordered pipeline
  --tag <tag>         Run checks containing a tag
  --history          Print recent run history
  --compare <target> Compare latest with previous, a run id, or a report path
  --failures-only    Only print failed checks in text summaries
  --summary          Print a compact one-line run summary
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

function resultDirPath(rootDir, config) {
  return path.resolve(rootDir, config.resultDir || 'harness/results');
}

function listReports(rootDir, config) {
  const dir = resultDirPath(rootDir, config);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== 'latest.json')
    .map((name) => path.join(dir, name))
    .sort();
}

function readReport(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function latestReportPath(rootDir, config) {
  return path.join(resultDirPath(rootDir, config), 'latest.json');
}

function resolveCompareTarget(rootDir, config, target) {
  const reports = listReports(rootDir, config);
  if (target === 'latest' || target === 'previous' || !target) {
    if (reports.length < 2) {
      throw new Error('Need at least two timestamped reports to compare latest with previous.');
    }
    return reports[reports.length - 2];
  }

  const directPath = path.resolve(rootDir, target);
  if (fs.existsSync(directPath)) return directPath;

  const byRunId = path.join(resultDirPath(rootDir, config), `${target}.json`);
  if (fs.existsSync(byRunId)) return byRunId;

  throw new Error(`Compare target not found: ${target}`);
}

function summarize(report, options = {}) {
  const results = flattenResults(report);
  const passed = results.filter((result) => result.status === 'pass').length;
  const failed = results.length - passed;
  const label = report.pipeline ? `Pipeline ${report.pipeline}` : 'Harness';
  if (options.summary) {
    console.log(`${label} ${report.status.toUpperCase()}: ${passed} passed, ${failed} failed (${report.durationMs}ms)`);
    return;
  }

  console.log(`\n${label} ${report.status.toUpperCase()}: ${passed} passed, ${failed} failed`);

  if (report.stages) {
    for (const stage of report.stages) {
      console.log(`\nStage ${stage.name}: ${stage.status.toUpperCase()}`);
      if (stage.status === 'skipped') continue;
      for (const result of stage.results) {
        if (options.failuresOnly && result.status === 'pass') continue;
        printResult(result);
      }
    }
  } else {
    for (const result of results) {
      if (options.failuresOnly && result.status === 'pass') continue;
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

function summarizeHistory(rootDir, config, options = {}) {
  const reports = listReports(rootDir, config);
  const recent = reports.slice(-10).reverse().map(readReport);
  if (options.json) {
    console.log(JSON.stringify(recent, null, 2));
    return;
  }
  if (recent.length === 0) {
    console.log('No harness history found.');
    return;
  }
  console.log('\nRecent harness runs:');
  for (const report of recent) {
    const results = flattenResults(report);
    const failed = results.filter((result) => result.status !== 'pass').length;
    const label = report.pipeline ? `pipeline:${report.pipeline}` : report.mode ? `mode:${report.mode}` : report.check ? `check:${report.check}` : 'run';
    console.log(`- ${report.runId} ${report.status.toUpperCase()} ${label} (${results.length - failed}/${results.length} passed, ${report.durationMs}ms)`);
  }
}

function compareReports(current, previous) {
  const currentMap = resultMap(current);
  const previousMap = resultMap(previous);
  const ids = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort();
  const diffs = [];

  for (const id of ids) {
    const now = currentMap.get(id);
    const before = previousMap.get(id);
    const currentStatus = now?.status || 'missing';
    const previousStatus = before?.status || 'missing';
    const durationDeltaMs = now && before ? now.durationMs - before.durationMs : null;
    const changed = currentStatus !== previousStatus;
    if (changed || durationDeltaMs !== null) {
      diffs.push({
        id,
        previousStatus,
        currentStatus,
        durationDeltaMs,
        changed,
        currentError: now?.stderr || now?.stdout || '',
        previousError: before?.stderr || before?.stdout || '',
      });
    }
  }

  return {
    current: runSummary(current),
    previous: runSummary(previous),
    changed: diffs.filter((diff) => diff.changed),
    diffs,
  };
}

function resultMap(report) {
  return new Map(flattenResults(report).map((result) => [result.id, result]));
}

function runSummary(report) {
  const results = flattenResults(report);
  const failed = results.filter((result) => result.status !== 'pass').length;
  return {
    runId: report.runId,
    status: report.status,
    mode: report.mode,
    pipeline: report.pipeline,
    check: report.check,
    startedAt: report.startedAt,
    durationMs: report.durationMs,
    passed: results.length - failed,
    failed,
    total: results.length,
  };
}

function printComparison(comparison, options = {}) {
  if (options.summary) {
    console.log(`Compare ${comparison.previous.runId} -> ${comparison.current.runId}: ${comparison.changed.length} status changes`);
    return;
  }
  console.log(`\nCompare ${comparison.previous.runId} -> ${comparison.current.runId}`);
  console.log(`Previous: ${comparison.previous.status.toUpperCase()} (${comparison.previous.passed}/${comparison.previous.total} passed)`);
  console.log(`Current:  ${comparison.current.status.toUpperCase()} (${comparison.current.passed}/${comparison.current.total} passed)`);

  if (comparison.changed.length === 0) {
    console.log('\nNo status changes.');
  } else {
    console.log('\nStatus changes:');
    for (const diff of comparison.changed) {
      console.log(`- ${diff.id}: ${diff.previousStatus} -> ${diff.currentStatus}`);
    }
  }

  const slower = comparison.diffs
    .filter((diff) => diff.durationDeltaMs !== null && diff.durationDeltaMs > 100)
    .sort((a, b) => b.durationDeltaMs - a.durationDeltaMs)
    .slice(0, 5);
  if (slower.length > 0) {
    console.log('\nSlower checks:');
    for (const diff of slower) {
      console.log(`- ${diff.id}: +${diff.durationDeltaMs}ms`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const config = readConfig(args.root, args.config);

  if (args.history) {
    summarizeHistory(args.root, config, { json: args.json });
    return;
  }

  if (args.compare) {
    const current = readReport(latestReportPath(args.root, config));
    const previous = readReport(resolveCompareTarget(args.root, config, args.compare));
    const comparison = compareReports(current, previous);
    if (args.json) {
      console.log(JSON.stringify(comparison, null, 2));
    } else {
      printComparison(comparison, { summary: args.summary });
    }
    process.exit(comparison.current.status === 'pass' ? 0 : 1);
  }

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
    summarize(report, {
      failuresOnly: args.failuresOnly,
      summary: args.summary,
    });
  }

  process.exit(report.status === 'pass' ? 0 : 1);
}

main().catch((error) => {
  console.error(`Harness error: ${error.message}`);
  process.exit(1);
});
