import { describe, expect, it } from 'vitest'
import { guessFormat, parseAccountFile, savedBenchmarkInfo } from './parse'

const usernames = (fileName: string, content: string): string[] =>
  parseAccountFile(fileName, content).accounts.map((a) => a.username)

describe('parseAccountFile: JSON', () => {
  it('reads the scan scripts’ output with ids and display names', () => {
    const { accounts, format } = parseAccountFile(
      'followers.json',
      '[{"username":"alice","id":"1","full_name":"Alice A"},{"username":"bob","pk":2}]'
    )
    expect(format).toBe('json')
    expect(accounts).toEqual([
      { username: 'alice', id: '1', fullName: 'Alice A', href: 'https://www.instagram.com/alice/' },
      { username: 'bob', id: '2', href: 'https://www.instagram.com/bob/' }
    ])
  })

  it('reads Instagram’s official followers export (array of string_list_data)', () => {
    const content = JSON.stringify([
      { title: '', string_list_data: [{ href: 'https://www.instagram.com/alice', value: 'alice' }] },
      { title: '', string_list_data: [{ href: 'https://www.instagram.com/bob', value: 'bob' }] }
    ])
    expect(usernames('followers_1.json', content)).toEqual(['alice', 'bob'])
  })

  it('reads the official following export (wrapped, username in title or href)', () => {
    const content = JSON.stringify({
      relationships_following: [
        { title: 'carol', string_list_data: [{ href: 'https://www.instagram.com/_u/carol' }] },
        { title: '', string_list_data: [{ href: 'https://www.instagram.com/_u/dave' }] }
      ]
    })
    expect(usernames('following.json', content)).toEqual(['carol', 'dave'])
  })

  it('never trusts a profile link from the file', () => {
    const { accounts } = parseAccountFile(
      'x.json',
      '[{"username":"alice","href":"javascript:alert(1)"}]'
    )
    expect(accounts[0].href).toBe('https://www.instagram.com/alice/')
  })

  it('rejects invalid JSON and unrecognised shapes', () => {
    expect(() => parseAccountFile('x.json', '{oops')).toThrow(/not valid JSON/)
    expect(() => parseAccountFile('x.json', '{"a":1}')).toThrow(/Unrecognized JSON/)
  })
})

describe('parseAccountFile: CSV', () => {
  it('handles quoted names with commas, escaped quotes and line breaks', () => {
    const csv = 'id,username,full_name\r\n1,alice,"A, ""the"" one"\r\n2,bob,"two\nlines"\r\n'
    const { accounts } = parseAccountFile('list.csv', csv)
    expect(accounts.map((a) => [a.id, a.username, a.fullName])).toEqual([
      ['1', 'alice', 'A, "the" one'],
      ['2', 'bob', 'two\nlines']
    ])
  })

  it('requires a username column', () => {
    expect(() => parseAccountFile('list.csv', 'name,age\nx,1')).toThrow(/no "username" column/)
  })
})

describe('parseAccountFile: TXT', () => {
  it('accepts bare handles, @handles and profile URLs, and skips # comments', () => {
    const txt = '# my list\nalice\n@bob\nhttps://www.instagram.com/carol/\n\ndave, erin'
    expect(usernames('list.txt', txt)).toEqual(['alice', 'bob', 'carol', 'dave', 'erin'])
  })
})

describe('parseAccountFile: general', () => {
  it('drops duplicates by id or case-insensitive username and counts them', () => {
    const result = parseAccountFile('list.txt', 'alice\nAlice\n@ALICE\nbob')
    expect(result.accounts.map((a) => a.username)).toEqual(['alice', 'bob'])
    expect(result.duplicatesDropped).toBe(2)
  })

  it('ignores a leading byte-order mark', () => {
    expect(usernames('list.json', '﻿[{"username":"alice"}]')).toEqual(['alice'])
  })

  it('rejects unsupported types and empty lists', () => {
    expect(() => parseAccountFile('list.pdf', 'x')).toThrow(/Unsupported file type/)
    expect(() => parseAccountFile('list.txt', '\n\n')).toThrow(/No accounts found/)
  })
})

describe('guessFormat', () => {
  it('tells JSON, CSV and plain text apart', () => {
    expect(guessFormat(' [{"username":"a"}]')).toBe('json')
    expect(guessFormat('{"relationships_following":[]}')).toBe('json')
    expect(guessFormat('id,username,full_name\n1,a,A')).toBe('csv')
    expect(guessFormat('alice\nbob')).toBe('txt')
    expect(guessFormat('alice, bob')).toBe('txt')
  })
})

describe('savedBenchmarkInfo', () => {
  it('returns the name and date of a saved benchmark, and null for anything else', () => {
    const saved = JSON.stringify({
      fileName: 'old.txt',
      loadedAt: '2026-11-06T07:17:25.000Z',
      format: 'txt',
      accounts: [{ username: 'alice' }]
    })
    expect(savedBenchmarkInfo(saved)).toEqual({
      fileName: 'old.txt',
      loadedAt: '2026-11-06T07:17:25.000Z'
    })
    expect(savedBenchmarkInfo('[{"username":"alice"}]')).toBeNull()
    expect(savedBenchmarkInfo('alice\nbob')).toBeNull()
  })
})
