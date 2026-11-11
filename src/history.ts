import type { AccountList, Snapshot } from '@shared/types'
import { makeSnapshot, serializeHistory, sortSnapshots } from '@shared/snapshot'

/** Snapshots are kept in this browser's IndexedDB, which has room for years of weekly lists.
 *  Storage is per browser: use Export on one machine and add that file on the other to move it. */
const DB_NAME = 'instaaudit'
const STORE = 'snapshots'
/** Where the single benchmark lived before there was a history. */
const LEGACY_KEY = 'instaaudit.benchmark'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const db = await openDb()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = work(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request ? request.result : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Moves a benchmark saved by the earlier single-benchmark version into the history. */
async function migrateLegacyBenchmark(): Promise<void> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(LEGACY_KEY)
  } catch {
    return
  }
  if (!raw) return
  const list = JSON.parse(raw) as AccountList
  await saveSnapshots([makeSnapshot(list)])
  localStorage.removeItem(LEGACY_KEY)
}

export async function loadSnapshots(): Promise<Snapshot[]> {
  try {
    await migrateLegacyBenchmark()
  } catch {
    // an unreadable old benchmark is left where it is rather than blocking the history
  }
  const all = await withStore<Snapshot[]>('readonly', (store) => store.getAll())
  return sortSnapshots(all ?? [])
}

export async function saveSnapshots(snapshots: Snapshot[]): Promise<void> {
  await withStore('readwrite', (store) => {
    for (const snapshot of snapshots) store.put(snapshot)
  })
}

export async function deleteSnapshot(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id))
}

export function downloadFile(fileName: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Downloads every snapshot as one file that can be added on another machine. */
export function exportHistory(snapshots: Snapshot[]): void {
  const today = new Date().toLocaleDateString('en-CA')
  downloadFile(`instaaudit-history-${today}.json`, serializeHistory(snapshots), 'application/json')
}
