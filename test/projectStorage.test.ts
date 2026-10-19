import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clearProjectStorage, persistProject, restoreProject } from '../src/projectStorage.ts'

describe('Project Storage in non-browser environment', () => {
  it('gracefully returns null when indexedDB is undefined', async () => {
    const restored = await restoreProject()
    assert.equal(restored, null)
  })

  it('gracefully catches persist errors when indexedDB is undefined', async () => {
    await assert.doesNotReject(async () => {
      await persistProject([], [], [], [], [], [], 2)
    })
  })

  it('gracefully catches clear errors when indexedDB is undefined', async () => {
    await assert.doesNotReject(async () => {
      await clearProjectStorage()
    })
  })
})

