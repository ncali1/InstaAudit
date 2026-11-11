import type { Account, ListFormat } from './types'

export interface ParsedFile {
  format: ListFormat
  accounts: Account[]
  duplicatesDropped: number
}

/** A single entry as Instagram's official export nests it inside followers_*.json / following.json */
interface StringListEntry {
  href?: string
  value?: string
}

interface RawListItem {
  /** Official export: newer following.json files put the username here and omit `value` */
  title?: string
  string_list_data?: StringListEntry[]
  value?: string
  href?: string
  /** Third-party / private-API exports */
  username?: string
  id?: string | number
  pk?: string | number
  full_name?: string
  /** InstaAudit's own saved/exported benchmark */
  fullName?: string
}

export function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase()
}

function usernameFromHref(href?: string): string | undefined {
  const match = href?.match(/instagram\.com\/(?:_u\/)?([^/?#]+)/i)
  return match?.[1]
}

/** Builds an Account from loosely-typed fields, or returns null if there's no usable username.
 *  The profile link is always derived from the username rather than trusted from the file. */
function makeAccount(username: unknown, id?: unknown, fullName?: unknown): Account | null {
  if (typeof username !== 'string' && typeof username !== 'number') return null
  const clean = String(username).trim().replace(/^@/, '')
  if (!clean) return null

  const account: Account = {
    username: clean,
    href: `https://www.instagram.com/${encodeURIComponent(clean)}/`
  }
  const cleanId = id === undefined || id === null ? '' : String(id).trim()
  if (cleanId) account.id = cleanId
  if (typeof fullName === 'string' && fullName.trim()) account.fullName = fullName.trim()
  return account
}

function dedupe(accounts: Account[]): { accounts: Account[]; duplicatesDropped: number } {
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  const unique: Account[] = []
  for (const a of accounts) {
    const name = normalizeUsername(a.username)
    if ((a.id && seenIds.has(a.id)) || seenNames.has(name)) continue
    if (a.id) seenIds.add(a.id)
    seenNames.add(name)
    unique.push(a)
  }
  return { accounts: unique, duplicatesDropped: accounts.length - unique.length }
}

function accountsFromRawItems(items: RawListItem[]): Account[] {
  const accounts: Account[] = []
  const push = (a: Account | null): void => {
    if (a) accounts.push(a)
  }
  for (const item of items) {
    if (typeof item === 'string') {
      push(makeAccount(item))
    } else if (!item || typeof item !== 'object') {
      continue
    } else if (item.username) {
      push(makeAccount(item.username, item.id ?? item.pk, item.full_name ?? item.fullName))
    } else if (Array.isArray(item.string_list_data) && item.string_list_data.length > 0) {
      for (const entry of item.string_list_data) {
        // `||`, not `??`: the export leaves title as an empty string when it isn't used.
        push(makeAccount(entry.value || item.title || usernameFromHref(entry.href)))
      }
    } else {
      push(makeAccount(item.value || item.title || usernameFromHref(item.href)))
    }
  }
  return accounts
}

/** The export root is either a plain array, or an object with one array-valued property
 *  (commonly `relationships_followers` or `relationships_following`). Find that array either way. */
function findItemArray(data: unknown): RawListItem[] {
  if (Array.isArray(data)) return data as RawListItem[]
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const preferredKeys = ['relationships_followers', 'relationships_following']
    for (const k of preferredKeys) {
      if (Array.isArray(obj[k])) return obj[k] as RawListItem[]
    }
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) return v as RawListItem[]
    }
  }
  throw new Error('Unrecognized JSON structure: expected an array or an object containing one.')
}

function parseJson(content: string): Account[] {
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch (err) {
    const detail = err instanceof Error ? ` (${err.message})` : ''
    throw new Error(`This file is not valid JSON${detail}.`)
  }
  return accountsFromRawItems(findItemArray(data))
}

/** Minimal RFC 4180 reader: handles quoted fields, escaped quotes ("") and line breaks inside
 *  quotes — display names in these exports routinely contain commas and emoji. */
function parseCsvRows(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"' && field === '') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && content[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

function parseCsv(content: string): Account[] {
  const rows = parseCsvRows(content)
  if (rows.length === 0) return []

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const column = (...names: string[]): number => header.findIndex((h) => names.includes(h))
  const usernameCol = column('username', 'user_name', 'handle')
  if (usernameCol === -1) {
    throw new Error('This CSV has no "username" column in its header row.')
  }
  const idCol = column('id', 'pk', 'user_id', 'userid')
  const fullNameCol = column('full_name', 'fullname', 'name')

  const accounts: Account[] = []
  for (const row of rows.slice(1)) {
    const account = makeAccount(
      row[usernameCol],
      idCol === -1 ? undefined : row[idCol],
      fullNameCol === -1 ? undefined : row[fullNameCol]
    )
    if (account) accounts.push(account)
  }
  return accounts
}

/** Plain list of usernames, typically one per line. Usernames can't contain whitespace, commas or
 *  semicolons, so those are all treated as separators. Each entry may be a bare handle, an
 *  @handle, or a profile URL. Lines starting with # are ignored. */
function parseTxt(content: string): Account[] {
  const accounts: Account[] = []
  for (const line of content.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    for (const token of line.split(/[\s,;]+/)) {
      const account = makeAccount(usernameFromHref(token) ?? token)
      if (account) accounts.push(account)
    }
  }
  return accounts
}

/** Pasted text has no file extension to go by, so the format is guessed from how it starts. */
export function guessFormat(content: string): ListFormat {
  const trimmed = content.replace(/^﻿/, '').trimStart()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return 'json'
  const firstLine = trimmed.split(/\r?\n/, 1)[0].toLowerCase()
  if (firstLine.includes(',') && /(^|,)\s*"?(username|user_name|handle)"?\s*(,|$)/.test(firstLine)) {
    return 'csv'
  }
  return 'txt'
}

/** A benchmark that InstaAudit saved or exported keeps the name and load date of the list it was
 *  made from. Returns those when `content` is such a file, so they survive a move between
 *  machines; the accounts themselves always go through the normal parser. */
export function savedBenchmarkInfo(
  content: string
): { fileName: string; loadedAt: string } | null {
  try {
    const data = JSON.parse(content.replace(/^﻿/, ''))
    if (
      data &&
      typeof data === 'object' &&
      Array.isArray(data.accounts) &&
      typeof data.fileName === 'string' &&
      typeof data.loadedAt === 'string' &&
      !Number.isNaN(Date.parse(data.loadedAt))
    ) {
      return { fileName: data.fileName, loadedAt: data.loadedAt }
    }
  } catch {
    // not JSON, so not a saved benchmark
  }
  return null
}

export function parseAccountFile(fileName: string, rawContent: string): ParsedFile {
  const content = rawContent.replace(/^﻿/, '')
  const ext = fileName.toLowerCase().split('.').pop()

  let format: ListFormat
  let parsed: Account[]
  if (ext === 'json') {
    format = 'json'
    parsed = parseJson(content)
  } else if (ext === 'csv') {
    format = 'csv'
    parsed = parseCsv(content)
  } else if (ext === 'txt') {
    format = 'txt'
    parsed = parseTxt(content)
  } else {
    throw new Error(`Unsupported file type: .${ext}. Please choose a .json, .csv or .txt file.`)
  }

  if (parsed.length === 0) throw new Error(`No accounts found in ${fileName}.`)
  return { format, ...dedupe(parsed) }
}
