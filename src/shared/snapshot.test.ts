import { describe, expect, it } from 'vitest'
import {
  dateFromFileName,
  mergeSnapshots,
  serializeHistory,
  snapshotsFromFile
} from './snapshot'
import { toCsv } from './csv'

const fallback = new Date('2026-01-15T10:00:00.000Z')
const list = (...usernames: string[]): string =>
  JSON.stringify(usernames.map((username, i) => ({ username, id: String(i + 1) })))

describe('dateFromFileName', () => {
  it('reads the date the scan scripts put in the file name', () => {
    const iso = dateFromFileName('instagram-followers-2026-11-06 (1).json')
    const date = new Date(iso as string)
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 11, 6])
  })

  it('returns null without a real date', () => {
    expect(dateFromFileName('followers.json')).toBeNull()
    expect(dateFromFileName('followers-2026-13-45.json')).toBeNull()
  })
})

describe('snapshotsFromFile', () => {
  it('dates a list from its file name, else from the fallback', () => {
    const [named] = snapshotsFromFile('instagram-followers-2026-11-06.json', list('a'), fallback)
    expect(named.loadedAt).toBe(dateFromFileName('2026-11-06'))
    const [plain] = snapshotsFromFile('followers.json', list('a'), fallback)
    expect(plain.loadedAt).toBe(fallback.toISOString())
  })

  it('gives the same file the same id, so re-adding it does not duplicate', () => {
    const first = snapshotsFromFile('instagram-followers-2026-11-06.json', list('a', 'b'), fallback)
    const again = snapshotsFromFile(
      'instagram-followers-2026-11-06.json',
      list('a', 'b'),
      new Date('2027-01-01T00:00:00.000Z')
    )
    expect(mergeSnapshots(first, again)).toHaveLength(1)
  })

  it('keeps the name and date of a benchmark saved by the earlier version', () => {
    const saved = JSON.stringify({
      fileName: 'old.txt',
      loadedAt: '2026-11-06T07:17:25.000Z',
      format: 'txt',
      accounts: [{ username: 'alice', href: 'x' }],
      duplicatesDropped: 0
    })
    const [snapshot] = snapshotsFromFile('benchmark.json', saved, fallback)
    expect(snapshot.fileName).toBe('old.txt')
    expect(snapshot.loadedAt).toBe('2026-11-06T07:17:25.000Z')
    expect(snapshot.accounts[0].href).toBe('https://www.instagram.com/alice/')
  })

  it('round-trips an exported history, oldest first', () => {
    const newer = snapshotsFromFile('instagram-followers-2026-11-13.json', list('a', 'c'), fallback)
    const older = snapshotsFromFile('instagram-followers-2026-11-06.json', list('a', 'b'), fallback)
    const history = mergeSnapshots(newer, older)
    expect(history.map((s) => s.fileName)).toEqual([
      'instagram-followers-2026-11-06.json',
      'instagram-followers-2026-11-13.json'
    ])

    const restored = snapshotsFromFile('instaaudit-history.json', serializeHistory(history), fallback)
    expect(mergeSnapshots([], restored)).toEqual(history)
  })
})

describe('toCsv', () => {
  it('quotes where needed and defuses spreadsheet formulas', () => {
    expect(toCsv(['username', 'full_name'], [['alice', 'A, "B"'], ['bob', '=SUM(1)'], ['c', undefined]])).toBe(
      'username,full_name\r\nalice,"A, ""B"""\r\nbob,\'=SUM(1)\r\nc,\r\n'
    )
  })
})
