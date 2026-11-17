import { useMemo, useState, type JSX } from 'react'
import type { Account, CompareResult, Snapshot } from '@shared/types'
import { toCsv } from '@shared/csv'
import { downloadFile } from '../history'
import { formatDay } from './HistoryPanel'

interface Props {
  result: CompareResult
  a: Snapshot
  b: Snapshot
}

type Tab = 'missing' | 'renamed' | 'added'

function matches(account: Account, query: string): boolean {
  return (
    account.username.toLowerCase().includes(query) ||
    (account.fullName?.toLowerCase().includes(query) ?? false)
  )
}

function ProfileLink({ account }: { account: Account }): JSX.Element {
  return (
    <a href={account.href} target="_blank" rel="noreferrer">
      @{account.username}
    </a>
  )
}

function Avatar({ username }: { username: string }): JSX.Element {
  const initial = username.replace(/^[^a-z0-9]+/i, '').charAt(0) || username.charAt(0)
  return (
    <span className="avatar" aria-hidden="true">
      {initial.toUpperCase()}
    </span>
  )
}

/** A summary tile that doubles as the tab selector for its list. */
function StatTab({
  kind,
  label,
  count,
  active,
  onSelect
}: {
  kind: Tab
  label: string
  count: number
  active: boolean
  onSelect: (tab: Tab) => void
}): JSX.Element {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`stat ${kind}${active ? ' active' : ''}`}
      onClick={() => onSelect(kind)}
    >
      <span className="stat-count">{count.toLocaleString()}</span>
      <span className="stat-label">{label}</span>
    </button>
  )
}

function ResultsPanel({ result, a, b }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('missing')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)

  const q = query.trim().toLowerCase()
  const missing = useMemo(() => result.missing.filter((a) => matches(a, q)), [result, q])
  const added = useMemo(() => result.added.filter((a) => matches(a, q)), [result, q])
  const renamed = useMemo(
    () => result.renamed.filter((r) => matches(r.before, q) || matches(r.after, q)),
    [result, q]
  )

  const visibleUsernames =
    tab === 'missing'
      ? missing.map((a) => a.username)
      : tab === 'added'
        ? added.map((a) => a.username)
        : renamed.map((r) => `${r.before.username} -> ${r.after.username}`)

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(visibleUsernames.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  /** Saves the list currently shown (after filtering) as a spreadsheet file. */
  const downloadCsv = (): void => {
    const accountRow = (x: Account): (string | undefined)[] => [x.username, x.fullName, x.id, x.href]
    const csv =
      tab === 'renamed'
        ? toCsv(
            ['old_username', 'new_username', 'full_name', 'id', 'profile'],
            renamed.map((r) => [r.before.username, ...accountRow(r.after)])
          )
        : toCsv(
            ['username', 'full_name', 'id', 'profile'],
            (tab === 'missing' ? missing : added).map(accountRow)
          )
    const day = (iso: string): string => new Date(iso).toLocaleDateString('en-CA')
    const name = { missing: 'not-in-b', renamed: 'renamed', added: 'new-in-b' }[tab]
    downloadFile(`instaaudit-${name}-${day(a.loadedAt)}-to-${day(b.loadedAt)}.csv`, csv, 'text/csv')
  }

  return (
    <div className="results">
      <h2 className="results-title">
        <span className="slot-tag">A</span> {formatDay(a.loadedAt)}
        <span className="arrow">→</span>
        <span className="slot-tag">B</span> {formatDay(b.loadedAt)}
      </h2>
      <nav className="stats" role="tablist">
        <StatTab
          kind="missing"
          label="Not in B"
          count={result.missing.length}
          active={tab === 'missing'}
          onSelect={setTab}
        />
        <StatTab
          kind="renamed"
          label="Renamed"
          count={result.renamed.length}
          active={tab === 'renamed'}
          onSelect={setTab}
        />
        <StatTab
          kind="added"
          label="New in B"
          count={result.added.length}
          active={tab === 'added'}
          onSelect={setTab}
        />
      </nav>

      <p className="meta results-summary">
        A has {a.accounts.length.toLocaleString()} accounts · B has{' '}
        {b.accounts.length.toLocaleString()} ·{' '}
        {result.inBoth.toLocaleString()} in both
      </p>

      {!result.canDetectRenames && (
        <div className="notice">
          At least one of these files has no account ids, so matching fell back to usernames where
          needed. An account that changed its @handle between A and B will show up under “Not in B”
          (and again under “New in B”) instead of “Renamed”.
        </div>
      )}

      <div className="results-toolbar">
        <input
          type="search"
          placeholder="Filter by username or name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button disabled={visibleUsernames.length === 0} onClick={copy}>
          {copied ? 'Copied' : 'Copy list'}
        </button>
        <button disabled={visibleUsernames.length === 0} onClick={downloadCsv}>
          Download CSV
        </button>
      </div>

      {tab === 'missing' && (
        <>
          <p className="tab-hint">
            In A but gone from B. That means they either left the list or their account
            was deactivated, deleted or banned — the files can’t tell these apart, so open the
            profile to check.
          </p>
          <AccountRows
            accounts={missing}
            note={(a) =>
              'handleTakenBy' in a && a.handleTakenBy
                ? 'original account gone — this handle now belongs to a different account'
                : undefined
            }
          />
        </>
      )}

      {tab === 'renamed' && (
        <>
          <p className="tab-hint">
            Same account in both files, just under a new @handle. These are not counted as missing.
          </p>
          {renamed.length === 0 ? (
            <p className="empty">Nothing here.</p>
          ) : (
            <ul className="account-rows">
              {renamed.map((r) => (
                <li key={r.before.id ?? r.before.username}>
                  <Avatar username={r.after.username} />
                  <span className="row-main">
                    <span className="old-handle">@{r.before.username}</span>
                    <span className="arrow">→</span>
                    <ProfileLink account={r.after} />
                    {r.after.fullName && <span className="full-name">{r.after.fullName}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === 'added' && (
        <>
          <p className="tab-hint">In B but not in A.</p>
          <AccountRows accounts={added} />
        </>
      )}
    </div>
  )
}

function AccountRows<T extends Account>({
  accounts,
  note
}: {
  accounts: T[]
  note?: (account: T) => string | undefined
}): JSX.Element {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyUsername = async (rowKey: string, username: string): Promise<void> => {
    await navigator.clipboard.writeText(username)
    setCopiedKey(rowKey)
    setTimeout(() => setCopiedKey((current) => (current === rowKey ? null : current)), 1500)
  }

  if (accounts.length === 0) return <p className="empty">Nothing here.</p>
  return (
    <ul className="account-rows">
      {accounts.map((a) => {
        const rowKey = a.id ?? a.username
        return (
          <li key={rowKey}>
            <Avatar username={a.username} />
            <span className="row-main">
              <span className="username">@{a.username}</span>
              {a.fullName && <span className="full-name">{a.fullName}</span>}
              {note?.(a) && <span className="row-note">{note(a)}</span>}
            </span>
            <span className="row-actions">
              <button onClick={() => copyUsername(rowKey, a.username)}>
                {copiedKey === rowKey ? 'Copied' : 'Copy username'}
              </button>
              <a href={a.href} target="_blank" rel="noreferrer">
                Open profile
              </a>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export default ResultsPanel
