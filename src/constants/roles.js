/**
 * Centralized Role Constants for RelayPOS SaaS ERP
 */

export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  OWNER: 'Owner',
  ADMIN: 'Admin',
  KASIR: 'Kasir',
  STAFF_KANTOR: 'Staff Kantor',
  KARYAWAN_CUCI: 'Karyawan Cuci',
}

export const ROLE_PERMISSIONS = {
  CAN_MANAGE_TENANTS: [ROLES.SUPER_ADMIN],
  CAN_VIEW_CONSOLIDATION: [ROLES.SUPER_ADMIN, ROLES.OWNER],
  CAN_VIEW_FINANCE: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
  CAN_MANAGE_INVENTORY: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
  CAN_MANAGE_STAFF: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN],
  CAN_ACCESS_POS: [ROLES.SUPER_ADMIN, ROLES.OWNER, ROLES.ADMIN, ROLES.KASIR],
  CAN_VIEW_EXECUTIVE_DASHBOARD: [ROLES.SUPER_ADMIN, ROLES.OWNER],
}

export function isSuperAdmin(role) {
  return role === ROLES.SUPER_ADMIN
}

export function isOwner(role) {
  return role === ROLES.OWNER
}

export function isOwnerOrSuperAdmin(role) {
  return role === ROLES.OWNER || role === ROLES.SUPER_ADMIN
}

export function isManagement(role) {
  return role === ROLES.SUPER_ADMIN || role === ROLES.OWNER || role === ROLES.ADMIN
}

export function isCashier(role) {
  return role === ROLES.KASIR
}
