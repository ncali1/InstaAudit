import type { AccountList, ListFormat, Snapshot } from './types'
import { parseAccountFile, savedBenchmarkInfo } from './parse'

const FORMATS: ListFormat[] = ['json', 'csv', 'txt']

export function makeSnapshot(list: AccountList): Snapshot {
  return { ...list, id: `${list.loadedAt}|${list.accounts.length}|${list.fileName}` }
}

/** The scan scripts name their files instagram-followers-YYYY-MM-DD; that date is when the list
 *  was taken, which is more useful than when it happened to be added here. */
export function dateFromFileName(fileName: string): string | null {
  const m = fileName.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  // Noon local time, so the calendar day is the same in every nearby time zone.
  const date = new Date(year, month - 1, day, 12)
  const valid =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  return valid ? date.toISOString() : null
}

export function sortSnapshots(snapshots: Snapshot[]): Snapshot[] {
  return [...snapshots].sort(
    (x, y) => x.loadedAt.localeCompare(y.loadedAt) || x.id.localeCompare(y.id)
  )
}

/** Adds `incoming` to `existing`; a snapshot with an id that is already present replaces it. */
export function mergeSnapshots(existing: Snapshot[], incoming: Snapshot[]): Snapshot[] {
  const byId = new Map(existing.map((s) => [s.id, s]))
  for (const s of incoming) byId.set(s.id, s)
  return sortSnapshots([...byId.values()])
}

export function serializeHistory(snapshots: Snapshot[]): string {
  return JSON.stringify({ instaAuditHistory: 1, snapshots })
}

/** Reads a file made by "Export history". Returns null when `content` is not one. The accounts
 *  are run back through the normal parser rather than trusted as stored. */
function parseHistoryExport(content: string): Snapshot[] | null {
  let data: unknown
  try {
    data = JSON.parse(content.replace(/^﻿/, ''))
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const { instaAuditHistory, snapshots } = data as Record<string, unknown>
  if (!instaAuditHistory || !Array.isArray(snapshots)) return null

  const result: Snapshot[] = []
  for (const raw of snapshots) {
    if (!raw || typeof raw !== 'object') continue
    const { fileName, loadedAt, format, accounts } = raw as Record<string, unknown>
    if (typeof fileName !== 'string' || typeof loadedAt !== 'string') continue
    if (Number.isNaN(Date.parse(loadedAt)) || !Array.isArray(accounts)) continue
    const parsed = parseAccountFile('snapshot.json', JSON.stringify(accounts))
    result.push(
      makeSnapshot({
        fileName,
        loadedAt: new Date(loadedAt).toISOString(),
        ...parsed,
        format: FORMATS.includes(format as ListFormat) ? (format as ListFormat) : 'json'
      })
    )
  }
  if (result.length === 0) throw new Error('This history file has no snapshots in it.')
  return result
}

/** Turns a chosen, dropped or pasted file into snapshots: several for an exported history,
 *  otherwise one. `fallbackDate` is used when neither the content nor the name carries a date. */
export function snapshotsFromFile(
  fileName: string,
  content: string,
  fallbackDate: Date
): Snapshot[] {
  const history = parseHistoryExport(content)
  if (history) return history

  const parsed = parseAccountFile(fileName, content)
  // A benchmark saved by an earlier version keeps the name and date of the list it was made from.
  const saved = parsed.format === 'json' ? savedBenchmarkInfo(content) : null
  return [
    makeSnapshot({
      fileName: saved?.fileName ?? fileName,
      loadedAt:
        (saved && new Date(saved.loadedAt).toISOString()) ??
        dateFromFileName(fileName) ??
        fallbackDate.toISOString(),
      ...parsed
    })
  ]
}
