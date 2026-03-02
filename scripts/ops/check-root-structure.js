#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');

const allowedRootFiles = new Set([
  '.dockerignore',
  '.gitignore',
  'docker-compose.yml',
  'package.json',
  'package-lock.json',
  'README.md',
  'start-services.js',
  'stop-services.js',
  'restart-services.js',
  'start.bat',
  'start.sh',
  'stop.bat',
  'restart.bat',
  'start-manual.bat',
  'restart_docker_services.ps1'
]);

const allowedRootDirs = new Set([
  '.git',
  '.github',
  '.husky',
  '.pytest_cache',
  '.tmp',
  'backend',
  'frontend',
  'data-service',
  'specs',
  'scripts',
  'docs',
  'tests',
  'artifacts',
  'data',
  'node_modules'
]);

const entries = fs.readdirSync(repoRoot, { withFileTypes: true });
const unexpected = [];
const workflowFilePatterns = [
  /^task_plan.*\.md$/i,
  /^findings\.md$/i,
  /^progress\.md$/i,
  /^\.env(\..+)?$/i,
];

function isWorkflowFile(name) {
  return workflowFilePatterns.some((pattern) => pattern.test(name));
}

function runGit(args) {
  return spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function isTrackedRootFile(name) {
  const result = runGit(['ls-files', '--error-unmatch', '--', name]);
  return result.status === 0;
}

function hasTrackedFilesInDir(name) {
  const result = runGit(['ls-files', '--', `${name}/`]);
  if (result.status !== 0) {
    return false;
  }
  return (result.stdout || '').trim().length > 0;
}

for (const entry of entries) {
  const name = entry.name;
  if (isWorkflowFile(name)) {
    continue;
  }

  if (entry.isDirectory()) {
    if (!allowedRootDirs.has(name) && hasTrackedFilesInDir(name)) {
      unexpected.push(`${name}/`);
    }
    continue;
  }

  if (!allowedRootFiles.has(name) && isTrackedRootFile(name)) {
    unexpected.push(name);
  }
}

if (unexpected.length > 0) {
  console.error('Unexpected root-level entries detected:');
  for (const item of unexpected.sort()) {
    console.error(`- ${item}`);
  }
  console.error('Move these files into scripts/, docs/, tests/, or artifacts/.');
  process.exit(1);
}

console.log('Root structure check passed.');
