/**
 * storageAdapter.js - Tenant-scoped browser storage facade.
 * Prevents cross-tenant state leaks in multi-outlet browser sessions and
 * handles storage quota/unavailable environments safely.
 */

const NAMESPACE = 'relaypos'

function getStorageEngine() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
  } catch {
    return null
  }
  return null
}

function cleanSegment(val, fallback = 'default') {
  const str = String(val ?? '').trim()
  return str || fallback
}

export const storageAdapter = {
  buildKey(tenantId, key) {
    return `${NAMESPACE}:${cleanSegment(tenantId)}:${cleanSegment(key, 'key')}`
  },

  getItem(tenantId, key, options = {}) {
    const engine = getStorageEngine()
    if (!engine) return null
    const scopedKey = this.buildKey(tenantId, key)
    try {
      const value = engine.getItem(scopedKey)
      if (value !== null && value !== undefined) {
        return value
      }
      if (options?.legacyKey) {
        const legacyValue = engine.getItem(options.legacyKey)
        if (legacyValue !== null && legacyValue !== undefined) {
          return legacyValue
        }
      }
      return null
    } catch {
      return null
    }
  },

  setItem(tenantId, key, value) {
    const engine = getStorageEngine()
    if (!engine) return false
    try {
      engine.setItem(this.buildKey(tenantId, key), String(value ?? ''))
      return true
    } catch {
      return false
    }
  },

  removeItem(tenantId, key) {
    const engine = getStorageEngine()
    if (!engine) return false
    try {
      engine.removeItem(this.buildKey(tenantId, key))
      return true
    } catch {
      return false
    }
  },

  getJSON(tenantId, key, fallback = null, options = {}) {
    const raw = this.getItem(tenantId, key, options)
    if (raw === null || raw === undefined || raw === '') {
      return fallback
    }
    try {
      return JSON.parse(raw)
    } catch {
      return fallback
    }
  },

  setJSON(tenantId, key, value) {
    try {
      return this.setItem(tenantId, key, JSON.stringify(value))
    } catch {
      return false
    }
  }
}

export default storageAdapter
