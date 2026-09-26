import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const curatedHosts = [
  { name: 'Claude Code', command: 'claude' },
  { name: 'Codex CLI', command: 'codex' },
  { name: 'Gemini CLI', command: 'gemini' },
  { name: 'OpenCode', command: 'opencode' },
]

export function probe(command) {
  const isWindows = process.platform === 'win32'
  const executable = isWindows ? 'cmd.exe' : command
  const args = isWindows ? ['/d', '/s', '/c', `${command} --version`] : ['--version']
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    shell: false,
    timeout: 5000,
  })

  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    installed: result.status === 0,
    version: result.status === 0 ? (output || 'version reported successfully') : null,
    error: result.status === 0 ? null : (result.error?.message || output || 'not found'),
  }
}

export function inspectHosts() {
  return curatedHosts.map(host => ({ ...host, ...probe(host.command) }))
}

export function printReport(results) {
  console.log('Curated CLI agent stack')
  for (const result of results) {
    const mark = result.installed ? 'OK' : 'MISSING'
    console.log(`- [${mark}] ${result.name} (${result.command})${result.version ? `: ${result.version}` : ''}`)
  }

  console.log('')
  console.log('Claude plugin activation is checked inside Claude Code; see docs/CLI-AGENT-STACK.md.')
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const results = inspectHosts()
  printReport(results)

  if (process.argv.includes('--strict') && results.some(result => !result.installed)) {
    process.exitCode = 1
  }
}
