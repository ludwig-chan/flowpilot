#!/usr/bin/env node
/**
 * release.mjs — FlowPilot 一键构建脚本
 *
 * 执行顺序：
 *   1. 同步三个子项目的版本号（可选，用 --version=x.x.x 指定）
 *   2. 构建浏览器扩展
 *   3. 将扩展产物部署到 client/resources/extension
 *   4. 构建 Electron 客户端（Windows portable）
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function run(cmd, cwd = __dirname) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd })
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function bumpVersion(pkgPath, version) {
  const pkg = readJson(pkgPath)
  pkg.version = version
  writeJson(pkgPath, pkg)
  console.log(`  版本号已更新：${pkgPath} → ${version}`)
}

// ── 解析参数 ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const versionArg = args.find(a => a.startsWith('--version='))
const targetVersion = versionArg ? versionArg.split('=')[1] : null

const extDir    = join(__dirname, 'extension')
const clientDir = join(__dirname, 'client')

// ── 步骤 1：同步版本号（仅在传入 --version 时执行）──────────────────────────

if (targetVersion) {
  console.log(`\n📌 同步版本号 → ${targetVersion}`)
  bumpVersion(join(extDir,    'package.json'), targetVersion)
  bumpVersion(join(clientDir, 'package.json'), targetVersion)
} else {
  const extVersion    = readJson(join(extDir,    'package.json')).version
  const clientVersion = readJson(join(clientDir, 'package.json')).version
  console.log(`\n📌 当前版本：extension=${extVersion}  client=${clientVersion}`)
  console.log('   如需统一版本，请传入 --version=x.x.x 参数')
}

// ── 步骤 2：构建扩展 ──────────────────────────────────────────────────────────

console.log('\n🔨 [1/3] 构建浏览器扩展...')
run('npm run build', extDir)

// ── 步骤 3：部署扩展到 client ─────────────────────────────────────────────────

console.log('\n📦 [2/3] 部署扩展到 client/resources/extension...')
run('npm run deploy', extDir)

// ── 步骤 4：构建 Electron 客户端 ──────────────────────────────────────────────

console.log('\n🖥️  [3/3] 构建 Electron 客户端（Windows）...')
run('npm run build:win', clientDir)

// ── 完成 ──────────────────────────────────────────────────────────────────────

const finalVersion = readJson(join(clientDir, 'package.json')).version
console.log(`\n✅ 构建完成！版本：v${finalVersion}`)
console.log(`   输出目录：client/dist/`)
