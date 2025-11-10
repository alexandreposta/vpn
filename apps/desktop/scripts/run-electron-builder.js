#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const scriptsDir = __dirname;
const env = {
  ...process.env,
  PATH: `${scriptsDir}${path.delimiter}${process.env.PATH || ''}`
};

const args = process.argv.slice(2);
const child = spawn('electron-builder', args, {
  stdio: 'inherit',
  env
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
