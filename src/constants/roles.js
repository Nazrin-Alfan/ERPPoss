/**
 * Centralized Role Constants for RelayPOS SaaS ERP
 */

export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  OWNER: 'Owner',
  ADMIN_PUSAT: 'Admin Pusat',
  ADMIN: 'Admin',
  KASIR: 'Kasir',
  STAFF_KANTOR: 'Staff Kantor',
  KARYAWAN_CUCI: 'Karyawan Cuci',
}

export const ROLE_PERMISSIONS = {
  CAN_MANAGE_TENANTS: [ROLES.SUPER_ADMIN],
  CAN_VIEW_CONSOLIDATION: [ROLES.SUPER_ADMIN, ROLES.OWNER],
  CAN_VIEW_EXECUTIVE_DASHBOARD: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN_PUSAT],
  CAN_VIEW_FINANCE: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN_PUSAT, ROLES.ADMIN],
  CAN_VIEW_REPORTS: [ROLES.OWNER],
  CAN_VIEW_INVENTORY_STOCK: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN_PUSAT, ROLES.ADMIN, ROLES.KASIR, ROLES.STAFF_KANTOR],
  CAN_VIEW_INVENTORY_COST: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN_PUSAT, ROLES.ADMIN, ROLES.STAFF_KANTOR],
  CAN_MANAGE_INVENTORY: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN_PUSAT, ROLES.ADMIN, ROLES.STAFF_KANTOR],
  CAN_OPNAME_INVENTORY: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN_PUSAT, ROLES.ADMIN],
  CAN_MANAGE_CATALOG: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN_PUSAT, ROLES.ADMIN],
  CAN_MANAGE_STAFF: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN_PUSAT, ROLES.ADMIN],
  CAN_ACCESS_POS: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN_PUSAT, ROLES.ADMIN, ROLES.KASIR],
  CAN_ACCESS_QUEUE: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN_PUSAT, ROLES.ADMIN, ROLES.KASIR, ROLES.KARYAWAN_CUCI],
  CAN_ACCESS_CRM: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN_PUSAT, ROLES.ADMIN],
  CAN_MANAGE_STORE_SETTINGS: [ROLES.SUPER_ADMIN, ROLES.OWNER],
  CAN_MANAGE_BANK_INTEGRATION: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN_PUSAT],
}

export function hasPermission(role, permissionKey) {
  if (!role || !permissionKey) return false
  const allowed = ROLE_PERMISSIONS[permissionKey]
  if (!Array.isArray(allowed)) return false
  return allowed.includes(role)
}

export function getRoleLandingRoute(role, { tenantCount = 1, hasQueue = true } = {}) {
  if (role === ROLES.SUPER_ADMIN) return '/founder'
  if (role === ROLES.OWNER) {
    return tenantCount > 1 ? '/konsolidasi' : '/dashboard'
  }
  if (role === ROLES.ADMIN_PUSAT) return '/finance'
  if (role === ROLES.STAFF_KANTOR) return '/gudang'
  if (role === ROLES.KARYAWAN_CUCI) return '/queue'
  if (role === ROLES.ADMIN || role === ROLES.KASIR) return '/pos'
  return '/pos'
}

export function isSuperAdmin(role) {
  return role === ROLES.SUPER_ADMIN
}

export function isOwner(role) {
  return role === ROLES.OWNER
}

export function isAdminPusat(role) {
  return role === ROLES.ADMIN_PUSAT
}

export function isOwnerOrSuperAdmin(role) {
  return role === ROLES.OWNER || role === ROLES.SUPER_ADMIN
}

export function isTenantWideManager(role) {
  return role === ROLES.SUPER_ADMIN || role === ROLES.OWNER || role === ROLES.ADMIN_PUSAT
}

export function isManagement(role) {
  return (
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.OWNER ||
    role === ROLES.ADMIN_PUSAT ||
    role === ROLES.ADMIN
  )
}

export function isCashier(role) {
  return role === ROLES.KASIR
}

export function getRoleDisplayLabel(role) {
  if (role === ROLES.ADMIN) return 'Admin Cabang'
  if (role === ROLES.ADMIN_PUSAT) return 'Admin Pusat'
  return role || '-'
}
