export type ListFormat = 'json' | 'csv' | 'txt'

/** Which side of the comparison a snapshot is used as: A is the older list, B the newer. */
export type Slot = 'a' | 'b'

export interface Account {
  username: string
  /** Stable per-account id. Present in third-party/private-API exports, absent from Instagram's
   *  official data export. Survives a username change, so it's what makes renames detectable. */
  id?: string
  fullName?: string
  href: string
}

export interface AccountList {
  fileName: string
  format: ListFormat
  /** ISO timestamp of when the list was taken: the date in its file name when there is one,
   *  otherwise the file's modified time, otherwise when it was added. */
  loadedAt: string
  accounts: Account[]
  /** Rows dropped because the same account appeared more than once in the file. */
  duplicatesDropped: number
}

/** A list kept in the history. The id is derived from the list's date, name and size, so adding
 *  the same file twice replaces the earlier copy instead of duplicating it. */
export interface Snapshot extends AccountList {
  id: string
}

export interface MissingAccount extends Account {
  /** Set when the handle still exists in B but belongs to a different account id — the original
   *  account is gone and someone else has since taken its username. */
  handleTakenBy?: Account
}

export interface RenamedAccount {
  before: Account
  after: Account
}

export interface CompareResult {
  /** In A, not in B. */
  missing: MissingAccount[]
  /** In both, but the username changed between A and B. */
  renamed: RenamedAccount[]
  /** In B, not in A. */
  added: Account[]
  inBoth: number
  /** False when either file lacks ids, in which case a renamed account can't be told apart from
   *  one that left and shows up under `missing` (and `added`) instead. */
  canDetectRenames: boolean
}
