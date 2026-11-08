#!/usr/bin/env node
// Local preview of the demo site: `npm run dev:demo` (same as `npm run dev`, with demo mode on).
// Works on Windows/macOS/Linux without extra packages.
import { spawn } from 'node:child_process'

const child = spawn('npx', ['next', 'dev', '-H', '0.0.0.0'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_DEMO_MODE: 'true', CRON_SECRET: process.env.CRON_SECRET || 'local-demo-secret' },
})
child.on('exit', code => process.exit(code ?? 0))
