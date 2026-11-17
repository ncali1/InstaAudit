import { beforeAll, describe, expect, it } from 'vitest'
import { build } from 'vite'
import consoleScript from 'virtual:console-script'

/** These tests guard the insta-scripts plugin in vite.config.ts. The two scan scripts run
 *  inside the user's logged-in instagram.com session, and they are assembled by plugin hooks
 *  (`resolveId`, `load`, `generateBundle`) whose behaviour can change with a bundler upgrade. */

const PLACEHOLDER = '@@SCAN_CORE@@'

/** Every host that appears in an absolute URL in `code`. */
function hosts(code: string): string[] {
  const found = [...code.matchAll(/(?:https?|wss?):\/\/([^/\s"'`$)]+)/g)].map(match => match[1])
  return [...new Set(found)]
}

function count(code: string, needle: string): number {
  return code.split(needle).length - 1
}

/** What must hold for a script we ask people to run on instagram.com.
 *  The network checks are a tripwire, not a guarantee: they match source text, so they catch
 *  an accidental new request or host, not code written to hide one. */
function expectSafeScanScript(code: string): void {
  // The shared scan code was pasted in, and the marker it replaces is gone.
  expect(code).not.toContain(PLACEHOLDER)
  expect(code).toContain('async function scanFollowers(')
  expect(code).toContain('function downloadFollowers(')

  // Data stays between the browser and Instagram: one request site, one host, and none of
  // the other ways a script can send data out.
  expect(count(code, 'fetch(')).toBe(1)
  expect(hosts(code)).toEqual(['www.instagram.com'])
  const otherWaysOut = [
    'new XMLHttpRequest',
    'GM_xmlhttpRequest',
    'sendBeacon',
    'WebSocket',
    'EventSource',
    'new Image'
  ]
  for (const api of otherWaysOut) {
    expect(code).not.toContain(api)
  }
}

describe('console script (virtual:console-script)', () => {
  it('is assembled from the template and the scan core', () => {
    expect(consoleScript).toContain('InstaAudit followers scan')
    expectSafeScanScript(consoleScript)
  })
})

describe('production build', () => {
  let userscript: string | undefined
  let bundledJs = ''

  beforeAll(async () => {
    // `write: false` keeps the output in memory, so the test never touches site/.
    const result = await build({ logLevel: 'silent', build: { write: false } })
    if (!('output' in result) && !Array.isArray(result)) {
      throw new Error('expected build output, got a watcher')
    }
    const outputs = Array.isArray(result) ? result : [result]
    for (const file of outputs.flatMap(output => output.output)) {
      if (file.type === 'chunk') {
        bundledJs += file.code
      } else if (file.fileName === 'instaaudit.user.js') {
        userscript =
          typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source)
      }
    }
    // A full production build; allow for a slow CI runner.
  }, 60_000)

  it('emits the Tampermonkey userscript', () => {
    expect(userscript).toBeDefined()
    const code = userscript ?? ''
    expect(code.startsWith('// ==UserScript==')).toBe(true)
    expect(code).toContain('// @match        https://www.instagram.com/*')
    expectSafeScanScript(code)

    // Tampermonkey only gives a script the powers its header asks for. Pin the header keys
    // and the grants, so adding one needs a test change: @require and @resource load remote
    // code, @updateURL and @downloadURL let the script replace itself, and @connect or a
    // GM_xmlhttpRequest grant lets it reach other hosts.
    const header = code.slice(0, code.indexOf('// ==/UserScript=='))
    const keys = [...header.matchAll(/^\/\/ @([\w-]+)/gm)].map(match => match[1])
    expect([...new Set(keys)].sort()).toEqual([
      'description',
      'grant',
      'match',
      'name',
      'namespace',
      'noframes',
      'run-at',
      'version'
    ])
    const grants = [...header.matchAll(/^\/\/ @grant\s+(\S+)/gm)].map(match => match[1])
    expect(grants.sort()).toEqual(['GM_getValue', 'GM_registerMenuCommand', 'GM_setValue'])
  })

  it('bundles the console script into the app for the Copy button', () => {
    expect(bundledJs).toContain('InstaAudit followers scan')
    expect(bundledJs).toContain('scanFollowers')
    expect(bundledJs).not.toContain(PLACEHOLDER)
  })
})
