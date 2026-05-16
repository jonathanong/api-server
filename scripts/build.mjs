import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// 1. rm -rf dist
rmSync('dist', { recursive: true, force: true })

// 2. tsc -p tsconfig.build.json
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const tsc = spawnSync(npxCmd, ['tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' })
if (tsc.status !== 0) process.exit(tsc.status ?? 1)
