// Simple in‑memory RBAC store (used for local/offline mode)
// In a real deployment this would be persisted in Postgres tables
// roles, permissions, role_permissions.

// Pre‑defined base permissions (expand as needed)
export const PERMISSIONS = [
  'view_dashboard',
  'manage_users',    // create / edit / delete user accounts
  'manage_roles',    // create / edit / delete roles & permissions
  'issue_license',
  'reset_tenant',
  'access_pos',
  'view_reports',
]

// Role map: roleId -> { name, permissionSet: Set<string> }
const roles = new Map()

// Seed default roles
const OWNER_ROLE_ID = 'role_owner'
roles.set(OWNER_ROLE_ID, {
  id: OWNER_ROLE_ID,
  name: 'Owner',
  permissionSet: new Set(PERMISSIONS), // owner has all perms
})

const MANAGER_ROLE_ID = 'role_manager'
roles.set(MANAGER_ROLE_ID, {
  id: MANAGER_ROLE_ID,
  name: 'Manager',
  permissionSet: new Set([
    'view_dashboard',
    'manage_users',
    'access_pos',
    'view_reports',
  ]),
})

const CASHIER_ROLE_ID = 'role_cashier'
roles.set(CASHIER_ROLE_ID, {
  id: CASHIER_ROLE_ID,
  name: 'Cashier',
  permissionSet: new Set(['access_pos']),
})

export function getAllRoles() {
  return Array.from(roles.values()).map(r => ({ id: r.id, name: r.name }))
}

export function getRoleById(id) {
  const r = roles.get(id)
  return r ? { id: r.id, name: r.name, permissions: Array.from(r.permissionSet) } : null
}

export function createRole(name, permissionList = []) {
  const id = `role_${Date.now()}`
  const permissionSet = new Set()
  permissionList.forEach(p => permissionSet.add(p))
  roles.set(id, { id, name, permissionSet })
  return { id, name, permissions: Array.from(permissionSet) }
}

export function updateRole(id, { name, permissions }) {
  const r = roles.get(id)
  if (!r) throw new Error('Role not found')
  if (name) r.name = name
  if (Array.isArray(permissions)) r.permissionSet = new Set(permissions)
  return { id: r.id, name: r.name, permissions: Array.from(r.permissionSet) }
}

export function deleteRole(id) {
  if (!roles.has(id)) throw new Error('Role not found')
  // Prevent deletion of built‑in roles
  if ([OWNER_ROLE_ID, MANAGER_ROLE_ID, CASHIER_ROLE_ID].includes(id)) {
    throw new Error('Cannot delete built‑in role')
  }
  roles.delete(id)
  return true
}

export function checkPermission(roleId, permission) {
  const r = roles.get(roleId)
  if (!r) return false
  return r.permissionSet.has(permission)
}

export const BUILTIN_ROLE_IDS = { OWNER_ROLE_ID, MANAGER_ROLE_ID, CASHIER_ROLE_ID }
