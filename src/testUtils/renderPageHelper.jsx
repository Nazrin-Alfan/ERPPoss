import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

export function createThenableQuery(defaultData = []) {
  const result = { data: defaultData, error: null, count: Array.isArray(defaultData) ? defaultData.length : 0 }
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    upsert: () => chain,
    delete: () => chain,
    eq: () => chain,
    neq: () => chain,
    gt: () => chain,
    gte: () => chain,
    lt: () => chain,
    lte: () => chain,
    ilike: () => chain,
    like: () => chain,
    is: () => chain,
    in: () => chain,
    or: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    range: () => chain,
    single: () => Promise.resolve({ data: Array.isArray(defaultData) ? (defaultData[0] || null) : defaultData, error: null }),
    maybeSingle: () => Promise.resolve({ data: Array.isArray(defaultData) ? (defaultData[0] || null) : defaultData, error: null }),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  }
  return chain
}

export function createMockSupabaseClient() {
  const channelMock = {
    on: () => channelMock,
    subscribe: () => channelMock,
    unsubscribe: () => Promise.resolve('ok')
  }
  return {
    from: () => createThenableQuery([]),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => channelMock,
    removeChannel: () => Promise.resolve('ok'),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      resetPasswordForEmail: () => Promise.resolve({ data: {}, error: null }),
      updateUser: () => Promise.resolve({ data: {}, error: null })
    }
  }
}

export function createDefaultAuthState(overrides = {}) {
  return {
    user: { id: 'user-qa-1', email: 'owner@relaypos.test' },
    profile: {
      id: 'user-qa-1',
      nama: 'Owner RelayPOS',
      email: 'owner@relaypos.test',
      role: 'Owner',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      branch_id: '22222222-2222-4222-8222-222222222222',
      is_super_admin: false,
      is_active: true
    },
    activeTenant: {
      id: '11111111-1111-4111-8111-111111111111',
      nama: 'RelayPOS Flagship',
      slug: 'relaypos-flagship',
      business_type: 'CARWASH_CAFE',
      plan: 'PRO',
      status: 'active'
    },
    activeBranch: {
      id: '22222222-2222-4222-8222-222222222222',
      nama: 'Cabang Pusat',
      is_main: true
    },
    branches: [
      { id: '22222222-2222-4222-8222-222222222222', nama: 'Cabang Pusat', is_main: true }
    ],
    userTenants: [
      { id: '11111111-1111-4111-8111-111111111111', nama: 'RelayPOS Flagship', business_type: 'CARWASH_CAFE' }
    ],
    loading: false,
    licenseStatus: { isExpired: false, isActive: true, isTrial: false, daysRemaining: 30 },
    isSuperAdmin: false,
    loginWithPassword: async () => ({ error: null }),
    loginWithGoogle: async () => ({ error: null }),
    registerOwner: async () => ({ error: null }),
    logout: async () => {},
    switchTenant: async () => {},
    switchBranch: async () => {},
    refreshTenants: async () => {},
    refreshProfile: async () => {},
    ...overrides
  }
}

export function renderWithRouter(element, initialEntry = '/') {
  return renderToString(
    <MemoryRouter initialEntries={[initialEntry]}>
      {element}
    </MemoryRouter>
  )
}
