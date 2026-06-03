import { defineConfig } from 'vite'
import { resolve, relative } from 'path'
import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'

interface BundleManifest {
  hash: string
  builtAt: string
  files: string[]
}

function bundleManifestPlugin() {
  return {
    name: 'bundle-manifest',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist')
      const bgFile      = resolve(distDir, 'background/index.js')
      const contentFile = resolve(distDir, 'content/index.js')
      if (!existsSync(bgFile) || !existsSync(contentFile)) return

      const combined = readFileSync(bgFile, 'utf-8') + readFileSync(contentFile, 'utf-8')
      const hash = createHash('sha256').update(combined).digest('hex').slice(0, 16)

      function collectFiles(dir: string): string[] {
        const result: string[] = []
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const fullPath = resolve(dir, entry.name)
          if (entry.isDirectory()) {
            result.push(...collectFiles(fullPath))
          } else if (entry.name !== 'bundle.manifest.json') {
            result.push(relative(distDir, fullPath).replace(/\\/g, '/'))
          }
        }
        return result
      }

      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const offset = -now.getTimezoneOffset()
      const sign = offset >= 0 ? '+' : '-'
      const absOffset = Math.abs(offset)
      const localISOString =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${String(now.getMilliseconds()).padStart(3, '0')}` +
        `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`
      const manifest: BundleManifest = {
        hash,
        builtAt: localISOString,
        files: collectFiles(distDir),
      }
      writeFileSync(
        resolve(distDir, 'bundle.manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8'
      )
    }
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src'),
  plugins: [bundleManifestPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'content/index.js',
      },
    },
  },
})
