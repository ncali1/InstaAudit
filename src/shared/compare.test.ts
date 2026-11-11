import { describe, expect, it } from 'vitest'
import { compareLists } from './compare'
import type { Account } from './types'

const acct = (username: string, id?: string): Account => ({
  username,
  href: `https://www.instagram.com/${username}/`,
  ...(id ? { id } : {})
})
const names = (accounts: Account[]): string[] => accounts.map((a) => a.username)

describe('compareLists', () => {
  it('reports who left, who joined and who is in both', () => {
    const result = compareLists(
      [acct('alice', '1'), acct('bob', '2'), acct('carol', '3')],
      [acct('alice', '1'), acct('carol', '3'), acct('dave', '4')]
    )
    expect(names(result.missing)).toEqual(['bob'])
    expect(names(result.added)).toEqual(['dave'])
    expect(result.renamed).toEqual([])
    expect(result.inBoth).toBe(2)
    expect(result.canDetectRenames).toBe(true)
  })

  it('treats a changed handle with the same id as a rename, not a departure', () => {
    const result = compareLists([acct('bob', '2')], [acct('bobby', '2')])
    expect(result.missing).toEqual([])
    expect(result.added).toEqual([])
    expect(result.renamed.map((r) => [r.before.username, r.after.username])).toEqual([
      ['bob', 'bobby']
    ])
  })

  it('flags a handle that now belongs to a different account', () => {
    const result = compareLists([acct('bob', '2')], [acct('bob', '99')])
    expect(names(result.missing)).toEqual(['bob'])
    expect(result.missing[0].handleTakenBy?.id).toBe('99')
    expect(names(result.added)).toEqual(['bob'])
  })

  it('falls back to usernames, case-insensitively, when one side has no ids', () => {
    const result = compareLists(
      [acct('Alice'), acct('bob')],
      [acct('alice', '1'), acct('bobby', '2')]
    )
    expect(names(result.missing)).toEqual(['bob'])
    expect(names(result.added)).toEqual(['bobby'])
    expect(result.inBoth).toBe(1)
    expect(result.canDetectRenames).toBe(false)
  })

  it('sorts each list by username', () => {
    const result = compareLists([acct('zed'), acct('amy')], [acct('yan'), acct('ben')])
    expect(names(result.missing)).toEqual(['amy', 'zed'])
    expect(names(result.added)).toEqual(['ben', 'yan'])
  })
})
