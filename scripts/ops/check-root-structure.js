#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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

for (const entry of entries) {
  const name = entry.name;

  if (entry.isDirectory()) {
    if (!allowedRootDirs.has(name)) {
      unexpected.push(`${name}/`);
    }
    continue;
  }

  if (!allowedRootFiles.has(name)) {
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
