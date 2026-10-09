import { describe, expect, test, vi } from 'vitest'

// The updater module imports Electron; only its pure feed rule is tested here.
vi.mock('electron', () => ({ app: {} }))
vi.mock('electron-updater', () => ({ autoUpdater: {} }))

const { testFeedOf } = await import('../../electron/updater')

describe('the update feed', () => {
  const local = 'http://127.0.0.1:8765/'

  test('a local test feed is honoured only under test, on loopback, and in a packaged app only for a test build', () => {
    expect(testFeedOf({ OFICINA_E2E: '1', OFICINA_UPDATE_URL: local }, false, false)).toBe(local)
    expect(testFeedOf({ OFICINA_E2E: '1', OFICINA_UPDATE_URL: local }, true, true)).toBe(local)
    expect(testFeedOf({ OFICINA_E2E: '1', OFICINA_UPDATE_URL: 'http://localhost:9000/' }, false, false)).toBe('http://localhost:9000/')
  })

  test('a release build, a missing test flag or a remote feed: GitHub, never the variable', () => {
    expect(testFeedOf({ OFICINA_E2E: '1', OFICINA_UPDATE_URL: local }, true, false)).toBeNull()
    expect(testFeedOf({ OFICINA_UPDATE_URL: local }, false, false)).toBeNull()
    expect(testFeedOf({ OFICINA_E2E: '1', OFICINA_UPDATE_URL: 'http://evil.example.com/' }, false, false)).toBeNull()
    expect(testFeedOf({ OFICINA_E2E: '1', OFICINA_UPDATE_URL: 'https://127.0.0.1.evil.example/' }, false, false)).toBeNull()
    expect(testFeedOf({ OFICINA_E2E: '1', OFICINA_UPDATE_URL: 'not a url' }, false, false)).toBeNull()
    expect(testFeedOf({ OFICINA_E2E: '1' }, false, false)).toBeNull()
  })
})
