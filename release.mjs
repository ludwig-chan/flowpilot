#!/usr/bin/env node
/**
 * release.mjs — FlowPilot 一键构建脚本
 *
 * 版本号以根目录 package.json 为唯一来源，发布时自动同步到：
 *   - extension/package.json
 *   - extension/public/manifest.json
 *   - extension/update.json
 *   - client/package.json
 *
 * 执行顺序：
 *   1. 同步所有子项目的版本号（可选，用 --version=x.x.x 指定新版本）
 *   2. 构建浏览器扩展
 *   3. 将扩展产物部署到 client/resources/extension
 *   4. 构建 Electron 客户端（Windows portable）
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function run(cmd, cwd = __dirname) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd })
}

function readJson(filePath) {
  const content = readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')
  return JSON.parse(content)
}

function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function killProcessByImage(imageName) {
  try {
    execSync(`taskkill /F /IM ${imageName} /T`, { stdio: 'ignore' })
    console.log(`  Closed running ${imageName}`)
  } catch {
    // taskkill exits non-zero when the process is not running.
  }
}

function removeDirWithRetry(dirPath, attempts = 5, delayMs = 1000) {
  if (!existsSync(dirPath)) {
    return
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      rmSync(dirPath, { recursive: true, force: true, maxRetries: 0 })
      console.log(`  Removed stale build directory: ${dirPath}`)
      return
    } catch (error) {
      if (attempt === attempts) {
        console.error(`\nFailed to remove stale build directory: ${dirPath}`)
        console.error('Close FlowPilot Client, Explorer preview panes, antivirus scans, or any process using client/dist/win-unpacked, then run the release again.')
        throw error
      }

      console.warn(`  Could not remove stale build directory yet (attempt ${attempt}/${attempts}). Retrying in ${delayMs}ms...`)
      sleep(delayMs)
    }
  }
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

const rootDir   = __dirname
const extDir    = join(__dirname, 'extension')
const clientDir = join(__dirname, 'client')

const GITHUB_REPO = 'ludwig-chan/flowpilot'

// ── 同步所有版本号 ────────────────────────────────────────────────────────────

function syncAllVersions(version) {
  const tag = `v${version}`

  // 根目录
  bumpVersion(join(rootDir, 'package.json'), version)

  // extension/package.json
  bumpVersion(join(extDir, 'package.json'), version)

  // extension/public/manifest.json（Chrome 扩展清单）
  const manifestPath = join(extDir, 'public', 'manifest.json')
  const manifest = readJson(manifestPath)
  manifest.version = version
  writeJson(manifestPath, manifest)
  console.log(`  版本号已更新：${manifestPath} → ${version}`)

  // extension/update.json（自动更新检测文件）
  const updatePath = join(extDir, 'update.json')
  const update = readJson(updatePath)
  update.tag_name = tag
  update.name = `FlowPilot Extension ${tag}`
  update.assets[0].browser_download_url =
    `https://github.com/${GITHUB_REPO}/releases/download/${tag}/flowpilot.zip`
  writeJson(updatePath, update)
  console.log(`  版本号已更新：${updatePath} → ${tag}`)

  // client/package.json
  bumpVersion(join(clientDir, 'package.json'), version)
}

// ── 步骤 1：同步版本号 ────────────────────────────────────────────────────────

const rootVersion = readJson(join(rootDir, 'package.json')).version

if (targetVersion) {
  console.log(`\n📌 同步版本号 → ${targetVersion}`)
  syncAllVersions(targetVersion)
} else {
  console.log(`\n📌 当前版本（来源：根目录 package.json）：v${rootVersion}`)
  console.log('   如需升级版本，请传入 --version=x.x.x 参数')
  syncAllVersions(rootVersion)
}

// ── 步骤 2：构建扩展 ──────────────────────────────────────────────────────────

console.log('\n🔨 [1/3] 构建浏览器扩展...')
run('npm run build', extDir)

// ── 步骤 3：部署扩展到 client ─────────────────────────────────────────────────

console.log('\n📦 [2/3] 部署扩展到 client/resources/extension...')
run('npm run deploy', extDir)

// ── 步骤 4：构建 Electron 客户端 ──────────────────────────────────────────────

console.log('\n🖥️  [3/3] 构建 Electron 客户端（Windows）...')

// 若旧版客户端正在运行，先关闭它，否则 electron-builder 无法覆盖 portable exe
killProcessByImage('FlowPilotClient.exe')
killProcessByImage('electron.exe')
sleep(1000)
removeDirWithRetry(join(clientDir, 'dist', 'win-unpacked'))

run('npm run build:win', clientDir)

// ── 完成 ──────────────────────────────────────────────────────────────────────

const finalVersion = readJson(join(clientDir, 'package.json')).version
console.log(`\n✅ 构建完成！版本：v${finalVersion}`)
console.log(`   输出目录：client/dist/`)

// ── 自动启动 ──────────────────────────────────────────────────────────────────

const { spawn } = await import('child_process')
const exePath = join(clientDir, 'dist', 'FlowPilotClient-portable.exe')
console.log(`\n🚀 启动：${exePath}`)
spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref()
