import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Slot, Snapshot } from '@shared/types'
import { compareLists } from '@shared/compare'
import { guessFormat } from '@shared/parse'
import { mergeSnapshots, snapshotsFromFile } from '@shared/snapshot'
import { deleteSnapshot, exportHistory, loadSnapshots, saveSnapshots } from './history'
import HistoryPanel from './components/HistoryPanel'
import ResultsPanel from './components/ResultsPanel'
import ScriptPanel from './components/ScriptPanel'
import { Logo, LockIcon } from './components/icons'
import './App.css'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface Selection {
  aId: string | null
  bId: string | null
}

/** The newest snapshot as B and the one before it as A. */
function latestPair(snapshots: Snapshot[]): Selection {
  return {
    aId: snapshots.length > 1 ? snapshots[snapshots.length - 2].id : null,
    bId: snapshots.length > 0 ? snapshots[snapshots.length - 1].id : null
  }
}

function App(): JSX.Element {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [selection, setSelection] = useState<Selection>({ aId: null, bId: null })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadSnapshots()
      .then((saved) => {
        setSnapshots(saved)
        setSelection(latestPair(saved))
      })
      .catch(() =>
        setError(
          'This browser would not open its saved snapshots. You can still add lists, but they ' +
            'will be gone when you close the page.'
        )
      )
  }, [])

  /** Parses the sources (nothing leaves the browser), adds what they hold to the history and
   *  selects the newest two snapshots. A source that fails is reported; the rest still load. */
  const add = useCallback(
    async (sources: (() => Promise<{ fileName: string; content: string; date: Date }>)[]) => {
      setError(null)
      setBusy(true)
      const incoming: Snapshot[] = []
      const problems: string[] = []
      for (const read of sources) {
        try {
          const { fileName, content, date } = await read()
          incoming.push(...snapshotsFromFile(fileName, content, date))
        } catch (err) {
          problems.push(errorMessage(err))
        }
      }
      if (incoming.length > 0) {
        try {
          await saveSnapshots(incoming)
        } catch {
          problems.push(
            'The new snapshots are loaded, but this browser would not save them, so they will ' +
              'be gone when you close the page.'
          )
        }
        setSnapshots((current) => {
          const merged = mergeSnapshots(current, incoming)
          setSelection(latestPair(merged))
          return merged
        })
      }
      if (problems.length > 0) setError(problems.join(' '))
      setBusy(false)
    },
    []
  )

  const handleFiles = useCallback(
    (files: File[]) =>
      add(
        files.map((file) => async () => ({
          fileName: file.name,
          content: await file.text(),
          date: new Date(file.lastModified || Date.now())
        }))
      ),
    [add]
  )

  const handlePaste = useCallback(
    () =>
      add([
        async () => {
          let content: string
          try {
            content = await navigator.clipboard.readText()
          } catch {
            throw new Error(
              'Could not read the clipboard. Allow clipboard access for this site, or save the ' +
                'list as a file and choose that instead.'
            )
          }
          if (!content.trim()) throw new Error('The clipboard is empty.')
          return { fileName: `Pasted list.${guessFormat(content)}`, content, date: new Date() }
        }
      ]),
    [add]
  )

  /** Picking the snapshot that is already on the other side swaps the two. */
  const handleSelect = useCallback((slot: Slot, id: string) => {
    setSelection(({ aId, bId }) =>
      slot === 'a'
        ? { aId: id, bId: id === bId ? aId : bId }
        : { aId: id === aId ? bId : aId, bId: id }
    )
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    setError(null)
    try {
      await deleteSnapshot(id)
    } catch {
      setError('This browser would not delete the saved snapshot.')
      return
    }
    setSnapshots((current) => {
      const remaining = current.filter((s) => s.id !== id)
      setSelection((sel) => (sel.aId === id || sel.bId === id ? latestPair(remaining) : sel))
      return remaining
    })
  }, [])

  const a = snapshots.find((s) => s.id === selection.aId) ?? null
  const b = snapshots.find((s) => s.id === selection.bId) ?? null
  const result = useMemo(() => (a && b ? compareLists(a.accounts, b.accounts) : null), [a, b])

  return (
    <div className="app">
      <header className="app-header">
        <Logo />
        <div className="app-title">
          <h1>InstaAudit</h1>
          <p className="subtitle">Track who stopped following you, snapshot by snapshot.</p>
        </div>
        <span className="privacy-pill" title="Your lists are read in this browser and never uploaded">
          <LockIcon />
          Runs in your browser
        </span>
      </header>

      <ScriptPanel />

      <HistoryPanel
        snapshots={snapshots}
        aId={selection.aId}
        bId={selection.bId}
        busy={busy}
        onFiles={handleFiles}
        onPaste={handlePaste}
        onSelect={handleSelect}
        onSelectPair={(aId, bId) => setSelection({ aId, bId })}
        onDelete={handleDelete}
        onExport={() => exportHistory(snapshots)}
      />

      {error && <div className="error-banner">{error}</div>}

      <main>
        {result && a && b ? (
          <ResultsPanel result={result} a={a} b={b} />
        ) : (
          <div className="empty-state">
            <p className="empty-state-title">
              {snapshots.length === 0
                ? 'Nothing to compare yet'
                : snapshots.length === 1
                  ? 'One more to go'
                  : 'Pick two snapshots'}
            </p>
            <p>
              {snapshots.length === 0
                ? 'Add a followers list to start your history.'
                : snapshots.length === 1
                  ? 'Add a second list to see who left and who joined between the two.'
                  : 'Pick an A and a B snapshot above to compare them.'}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
