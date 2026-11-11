import type { Account, CompareResult, MissingAccount, RenamedAccount } from './types'
import { normalizeUsername } from './parse'

const byUsername = (a: Account, b: Account): number => a.username.localeCompare(b.username)

/** Compares benchmark list A against list B.
 *
 *  Accounts are matched on their stable id whenever both sides have one, so a changed @handle is
 *  reported as a rename instead of a departure. The username is only used as the match key when
 *  one side of a pair has no id to compare (e.g. Instagram's official export, or a CSV without an
 *  id column) — which keeps a file with ids comparable against one without. */
export function compareLists(a: Account[], b: Account[]): CompareResult {
  const bById = new Map<string, Account>()
  const bByName = new Map<string, Account>()
  for (const account of b) {
    if (account.id) bById.set(account.id, account)
    bByName.set(normalizeUsername(account.username), account)
  }

  const missing: MissingAccount[] = []
  const renamed: RenamedAccount[] = []
  const matchedInB = new Set<Account>()

  for (const account of a) {
    const name = normalizeUsername(account.username)
    let match = account.id ? bById.get(account.id) : undefined

    if (!match) {
      const sameHandle = bByName.get(name)
      if (sameHandle && account.id && sameHandle.id) {
        // Both have ids and they differ: a different account now holds this username.
        missing.push({ ...account, handleTakenBy: sameHandle })
        continue
      }
      match = sameHandle
    }

    if (!match) {
      missing.push(account)
      continue
    }

    matchedInB.add(match)
    if (normalizeUsername(match.username) !== name) renamed.push({ before: account, after: match })
  }

  const added = b.filter((account) => !matchedInB.has(account))

  missing.sort(byUsername)
  added.sort(byUsername)
  renamed.sort((x, y) => byUsername(x.before, y.before))

  return {
    missing,
    renamed,
    added,
    inBoth: matchedInB.size,
    canDetectRenames: a.every((x) => x.id) && b.every((x) => x.id)
  }
}
