const ERP_ROLES = new Set(['Owner', 'Admin', 'Kasir', 'Super Admin'])

export function requireCloudProfile(profile, userId) {
  if (!profile || !profile.id || (userId && profile.id !== userId) || !profile.tenant_id
    || !ERP_ROLES.has(profile.role) || profile.is_active === false) {
    throw new Error('Profil dan keanggotaan tenant cloud belum tersedia atau tidak diizinkan. Hubungi administrator.')
  }
  return profile
}

export function resolveCloudTenants(profile, rows, savedTenantId) {
  if (!Array.isArray(rows)) throw new Error('Daftar tenant cloud tidak tersedia.')
  const tenants = rows.filter(tenant => tenant?.id && tenant.is_active !== false && tenant.is_archived !== true
    && !['archived', 'inactive', 'suspended'].includes(String(tenant.status || '').toLowerCase())
    && (profile.role === 'Super Admin' || tenant.id === profile.tenant_id))
  if (!tenants.length) throw new Error('Tenant cloud yang diizinkan belum tersedia. Hubungi administrator.')
  const activeTenant = (profile.role !== 'Kasir' && tenants.find(tenant => tenant.id === savedTenantId))
    || tenants.find(tenant => tenant.id === profile.tenant_id) || tenants[0]
  return { tenants, activeTenant }
}

/** Commit identity only after both authoritative profile and tenant reads finish. */
export async function authorizeCloudSession(session, { getProfile, listTenants, commit, clear, isCurrent = () => true, savedTenantId }) {
  try {
    if (!session?.user?.id) {
      if (isCurrent()) clear()
      return null
    }
    const profile = requireCloudProfile(await getProfile(session.user.id), session.user.id)
    const membership = resolveCloudTenants(profile, await listTenants(), savedTenantId)
    const identity = { user: session.user, profile, ...membership }
    if (isCurrent()) commit(identity)
    return identity
  } catch (error) {
    if (isCurrent()) clear()
    throw error
  }
}
