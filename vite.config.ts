import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/** Builds the two Instagram scan scripts from one copy of the scan code.
 *  - `virtual:console-script` is the paste-in-console script, as a string, for the Copy button.
 *  - `/instaaudit.user.js` is the Tampermonkey userscript, served in dev and emitted on build. */
function instaScripts(): Plugin {
  const paths = {
    core: resolve('src/scripts/scan-core.js'),
    console: resolve('src/scripts/console.template.js'),
    userscript: resolve('src/scripts/userscript.template.js')
  }
  const read = (path: string): string => readFileSync(path, 'utf-8')
  const assemble = (template: string): string =>
    read(template).replace('/* @@SCAN_CORE@@ */', () => read(paths.core).trimEnd())

  const VIRTUAL = 'virtual:console-script'
  const RESOLVED = '\0' + VIRTUAL

  return {
    name: 'insta-scripts',
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : undefined
    },
    load(id) {
      if (id !== RESOLVED) return undefined
      for (const path of Object.values(paths)) this.addWatchFile(path)
      return `export default ${JSON.stringify(assemble(paths.console))}`
    },
    configureServer(server) {
      server.middlewares.use('/instaaudit.user.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.end(assemble(paths.userscript))
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'instaaudit.user.js',
        source: assemble(paths.userscript)
      })
    }
  }
}

export default defineConfig({
  // Relative asset paths, so the built site works from a domain root or a sub-folder alike.
  base: './',
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  },
  build: {
    outDir: 'site'
  },
  test: {
    // Test files that share a module race on Windows when run in parallel (EBUSY on the
    // transform cache), and the suite is small enough that running them in turn costs nothing.
    fileParallelism: false
  },
  plugins: [react(), instaScripts()]
})
