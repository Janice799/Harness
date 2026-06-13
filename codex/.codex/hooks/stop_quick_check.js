#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');

if (!fs.existsSync('scripts/harness-runner.js')) {
  console.log('Codex harness skipped: scripts/harness-runner.js not found.');
  process.exit(0);
}

if (!fs.existsSync('harness.config.json')) {
  console.log('Codex harness skipped: harness.config.json not found.');
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  ['scripts/harness-runner.js', '--mode', 'quick', '--hook'],
  {
    stdio: 'inherit',
    env: process.env,
  }
);

process.exit(result.status || 0);
