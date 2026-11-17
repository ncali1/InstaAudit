import { useState, type JSX } from 'react'
import script from 'virtual:console-script'

/** How to get a followers list out of Instagram, with the console script one click away. */
function ScriptPanel(): JSX.Element {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(script)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    setTimeout(() => setStatus('idle'), 2500)
  }

  return (
    <details className="card script-panel">
      <summary>
        <span>How to get your followers list</span>
        <span className="chevron" aria-hidden="true" />
      </summary>
      <ol className="steps">
        <li>
          <span className="step-number">1</span>
          <div>
            <p className="step-title">Copy the script</p>
            <button className="primary" onClick={copy}>
              {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy script'}
            </button>
          </div>
        </li>
        <li>
          <span className="step-number">2</span>
          <div>
            <p className="step-title">Run it on Instagram</p>
            <p className="meta">
              Open{' '}
              <a href="https://www.instagram.com/" target="_blank" rel="noreferrer">
                instagram.com
              </a>{' '}
              while logged in, open the DevTools console, paste the script and press Enter.
            </p>
          </div>
        </li>
        <li>
          <span className="step-number">3</span>
          <div>
            <p className="step-title">Bring the list back</p>
            <p className="meta">
              Press <strong>Copy</strong> in the box that appears on the Instagram page, then press{' '}
              <strong>Paste</strong> on list A or B here.
            </p>
          </div>
        </li>
      </ol>
      <div className="script-auto">
        <div>
          <p className="step-title">Or have it done for you every week</p>
          <p className="meta">
            Install the{' '}
            <a href="https://www.tampermonkey.net/" target="_blank" rel="noreferrer">
              Tampermonkey
            </a>{' '}
            browser extension, then install the userscript. Whenever you open Instagram and the
            last scan is 7 or more days old, it saves <code>instagram-followers-YYYY-MM-DD.json</code>{' '}
            to your Downloads. Drop that file on list B.
          </p>
        </div>
        <a className="button" href="./instaaudit.user.js" target="_blank" rel="noreferrer">
          Install userscript
        </a>
      </div>
      <p className="meta script-note">
        The script only reads your followers list. It runs in your own Instagram tab; this site
        never contacts Instagram.
      </p>
    </details>
  )
}

export default ScriptPanel
