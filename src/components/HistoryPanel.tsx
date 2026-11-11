import { useMemo, useRef, useState } from 'react'
import type { Slot, Snapshot } from '@shared/types'
import { compareLists } from '@shared/compare'
import { CloseIcon, UploadIcon } from './icons'

interface Props {
  /** Oldest first. */
  snapshots: Snapshot[]
  aId: string | null
  bId: string | null
  busy: boolean
  onFiles: (files: File[]) => void
  onPaste: () => void
  onSelect: (slot: Slot, id: string) => void
  onSelectPair: (aId: string, bId: string) => void
  onDelete: (id: string) => void
  onExport: () => void
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

interface Delta {
  previousId: string
  gained: number
  lost: number
}

function HistoryPanel({
  snapshots,
  aId,
  bId,
  busy,
  onFiles,
  onPaste,
  onSelect,
  onSelectPair,
  onDelete,
  onExport
}: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  /** What changed between each snapshot and the one before it. */
  const deltas = useMemo(() => {
    const map = new Map<string, Delta>()
    for (let i = 1; i < snapshots.length; i++) {
      const result = compareLists(snapshots[i - 1].accounts, snapshots[i].accounts)
      map.set(snapshots[i].id, {
        previousId: snapshots[i - 1].id,
        gained: result.added.length,
        lost: result.missing.length
      })
    }
    return map
  }, [snapshots])

  const askDelete = (id: string): void => {
    if (confirmId === id) {
      setConfirmId(null)
      onDelete(id)
      return
    }
    setConfirmId(id)
    setTimeout(() => setConfirmId((current) => (current === id ? null : current)), 4000)
  }

  return (
    <section
      className={`card history${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!busy) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const files = [...e.dataTransfer.files]
        if (files.length > 0 && !busy) onFiles(files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json,.csv,.txt"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          // Reset so choosing the same file again still fires a change event.
          e.target.value = ''
          if (files.length > 0) onFiles(files)
        }}
      />

      <header className="history-header">
        <h2>Snapshots</h2>
        <span className="meta">
          {snapshots.length === 0
            ? 'Saved in this browser'
            : `${snapshots.length} saved in this browser`}
        </span>
        {snapshots.length > 0 && (
          <button
            disabled={busy}
            title="Download every snapshot as one file, to add on another computer"
            onClick={onExport}
          >
            Export history
          </button>
        )}
      </header>

      <div className="dropzone">
        <span className="dropzone-icon">
          <UploadIcon />
        </span>
        <div className="dropzone-text">
          <p className="dropzone-title">Add a followers list</p>
          <p className="meta">
            Drop files here — .json, .csv, .txt, or an exported InstaAudit history.
          </p>
        </div>
        <div className="actions">
          <button className="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'Adding…' : 'Choose files'}
          </button>
          <button disabled={busy} onClick={onPaste}>
            Paste
          </button>
        </div>
      </div>

      {snapshots.length > 0 && (
        <ul className="snapshot-rows">
          {[...snapshots].reverse().map((s) => {
            const delta = deltas.get(s.id)
            const hasIds = s.accounts.every((a) => a.id)
            return (
              <li key={s.id} className={s.id === aId || s.id === bId ? 'selected' : ''}>
                <span className="snapshot-date">{formatDay(s.loadedAt)}</span>
                <span className="snapshot-info">
                  <span className="snapshot-name" title={s.fileName}>
                    {s.fileName}
                  </span>
                  <span className="meta">
                    {s.accounts.length.toLocaleString()} accounts
                    {!hasIds && ' · no account ids'}
                    {s.duplicatesDropped > 0 && ` · ${s.duplicatesDropped} duplicates ignored`}
                  </span>
                </span>
                {delta ? (
                  <button
                    className="delta"
                    title="Compare with the snapshot before it"
                    onClick={() => onSelectPair(delta.previousId, s.id)}
                  >
                    <span className="gained">+{delta.gained.toLocaleString()}</span>
                    <span className="lost">−{delta.lost.toLocaleString()}</span>
                  </button>
                ) : (
                  <span className="meta delta-placeholder">
                    {snapshots.length > 1 ? 'First' : ''}
                  </span>
                )}
                <span className="slot-toggle">
                  <button
                    className={s.id === aId ? 'active' : ''}
                    aria-pressed={s.id === aId}
                    title="Use as A, the older list"
                    onClick={() => onSelect('a', s.id)}
                  >
                    A
                  </button>
                  <button
                    className={s.id === bId ? 'active' : ''}
                    aria-pressed={s.id === bId}
                    title="Use as B, the newer list"
                    onClick={() => onSelect('b', s.id)}
                  >
                    B
                  </button>
                </span>
                {confirmId === s.id ? (
                  <button className="danger" onClick={() => askDelete(s.id)}>
                    Delete?
                  </button>
                ) : (
                  <button
                    className="icon-button"
                    title="Delete snapshot"
                    aria-label={`Delete snapshot from ${formatDay(s.loadedAt)}`}
                    onClick={() => askDelete(s.id)}
                  >
                    <CloseIcon />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default HistoryPanel
