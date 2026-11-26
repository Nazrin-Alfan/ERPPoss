import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { transformWithOxc, parseAst } from 'vite'

export const GLOBALS = new Set([
  'window', 'document', 'console', 'Math', 'Date', 'parseInt', 'parseFloat',
  'String', 'Boolean', 'Number', 'Array', 'Object', 'Promise', 'localStorage',
  'sessionStorage', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'queueMicrotask', 'fetch', 'navigator', 'location', 'history', 'alert', 'confirm', 'prompt',
  'URL', 'URLSearchParams', 'encodeURIComponent', 'decodeURIComponent', 'Blob', 'JSON', 'Set',
  'Map', 'WeakMap', 'WeakSet', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'Intl', 'React', 'undefined', 'null', 'NaN', 'Infinity', 'Symbol', 'BigInt', 'Proxy', 'Reflect',
  'btoa', 'atob', 'process', 'require', 'global', 'globalThis', 'crypto', 'structuredClone',
  'isNaN', 'isFinite', 'encodeURI', 'decodeURI', 'self',
  'File', 'FileReader', 'FormData', 'CustomEvent', 'Event', 'EventTarget', 'AbortController', 'AbortSignal',
  'MouseEvent', 'KeyboardEvent', 'ClipboardEvent', 'DragEvent', 'DataTransfer',
  'HTMLElement', 'Element', 'Node', 'CSS', 'DOMParser', 'TextEncoder', 'TextDecoder',
  'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'Audio', 'Image',
  'Uint8Array', 'ArrayBuffer', 'BroadcastChannel', 'WebSocket', 'Worker', 'indexedDB', 'IDBKeyRange',
  'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Headers', 'Request', 'Response',
  'import', 'meta', 'jsx', 'jsxs', 'jsxDEV', 'Fragment', 'arguments'
])

function walk(node, parent, visitors) {
  if (!node || typeof node !== 'object') return
  if (visitors.enter) visitors.enter(node, parent)
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const c of child) walk(c, node, visitors)
    } else if (child && typeof child === 'object') {
      walk(child, node, visitors)
    }
  }
  if (visitors.leave) visitors.leave(node, parent)
}

export function collectPatternIdentifiers(pattern, declaredSet) {
  if (!pattern || typeof pattern !== 'object') return
  switch (pattern.type) {
    case 'Identifier':
      if (pattern.name) declaredSet.add(pattern.name)
      break
    case 'ObjectPattern':
      for (const prop of pattern.properties || []) {
        if (!prop) continue
        if (prop.type === 'RestElement') {
          collectPatternIdentifiers(prop.argument, declaredSet)
        } else if (prop.value) {
          collectPatternIdentifiers(prop.value, declaredSet)
        } else if (prop.key?.name) {
          declaredSet.add(prop.key.name)
        }
      }
      break
    case 'ArrayPattern':
      for (const el of pattern.elements || []) {
        if (el) collectPatternIdentifiers(el, declaredSet)
      }
      break
    case 'AssignmentPattern':
      collectPatternIdentifiers(pattern.left, declaredSet)
      break
    case 'RestElement':
      collectPatternIdentifiers(pattern.argument, declaredSet)
      break
    default:
      break
  }
}

export async function auditFileScope(code, filename = 'module.jsx') {
  const lang = filename.endsWith('.jsx') ? 'jsx' : 'js'
  const transformed = await transformWithOxc(code, filename, { lang })
  const ast = parseAst(transformed.code)

  const declared = new Set([...GLOBALS])

  walk(ast, null, {
    enter(node) {
      if (node.type === 'ImportSpecifier' || node.type === 'ImportDefaultSpecifier' || node.type === 'ImportNamespaceSpecifier') {
        if (node.local?.name) declared.add(node.local.name)
      }
      if (node.type === 'VariableDeclarator') {
        collectPatternIdentifiers(node.id, declared)
      }
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        if (node.id?.name) declared.add(node.id.name)
        for (const param of node.params || []) {
          collectPatternIdentifiers(param, declared)
        }
      }
      if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
        if (node.id?.name) declared.add(node.id.name)
      }
      if (node.type === 'CatchClause' && node.param) {
        collectPatternIdentifiers(node.param, declared)
      }
      if ((node.type === 'ForInStatement' || node.type === 'ForOfStatement') && node.left) {
        if (node.left.type !== 'VariableDeclaration') {
          collectPatternIdentifiers(node.left, declared)
        }
      }
    }
  })

  const walkWithAncestors = (node, parent, grandparent) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'Identifier') {
      const name = node.name
      const isReExport =
        parent?.type === 'ExportSpecifier' &&
        Boolean(grandparent?.source)

      if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) return
      if (parent?.type === 'MetaProperty' && parent.property === node) return
      if (parent?.type === 'Property' && parent.key === node && !parent.computed) return
      if (parent?.type === 'MethodDefinition' && parent.key === node && !parent.computed) return
      if (parent?.type === 'PropertyDefinition' && parent.key === node && !parent.computed) return
      if (parent?.type === 'ImportSpecifier' && (parent.imported === node || parent.local === node)) return
      if (parent?.type === 'ImportDefaultSpecifier' && parent.local === node) return
      if (parent?.type === 'ImportNamespaceSpecifier' && parent.local === node) return
      if (parent?.type === 'ExportSpecifier' && (parent.exported === node || (isReExport && parent.local === node))) return
      if (parent?.type === 'VariableDeclarator' && parent.id === node) return
      if ((parent?.type === 'FunctionDeclaration' || parent?.type === 'FunctionExpression') && parent.id === node) return
      if ((parent?.type === 'ClassDeclaration' || parent?.type === 'ClassExpression') && parent.id === node) return
      if (parent?.type === 'CatchClause' && parent.param === node) return
      if ((parent?.type === 'LabeledStatement' || parent?.type === 'BreakStatement' || parent?.type === 'ContinueStatement') && parent.label === node) return

      if (!declared.has(name)) {
        undeclared.add(name)
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue
      const child = node[key]
      if (Array.isArray(child)) {
        for (const c of child) walkWithAncestors(c, node, parent)
      } else if (child && typeof child === 'object') {
        walkWithAncestors(child, node, parent)
      }
    }
  }

  const undeclared = new Set()
  walkWithAncestors(ast, null, null)

  return [...undeclared]
}

function getFilesRecursively(dir) {
  if (!fs.existsSync(dir)) return []
  let results = []
  const list = fs.readdirSync(dir)
  for (const file of list) {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat && stat.isDirectory()) {
      if (!file.includes('__tests__') && !file.includes('node_modules')) {
        results = results.concat(getFilesRecursively(fullPath))
      }
    } else if ((file.endsWith('.jsx') || file.endsWith('.js')) && !file.includes('.test.')) {
      results.push(fullPath)
    }
  }
  return results
}

async function runCliAudit() {
  const targetDirs = ['src/pages', 'src/components', 'src/hooks']
  const files = targetDirs.flatMap((d) => getFilesRecursively(path.resolve(d)))

  console.log(`Auditing scope and declared identifiers across ${files.length} files (pages, components, hooks)...`)

  let totalErrors = 0

  for (const filePath of files) {
    const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/')
    const code = fs.readFileSync(filePath, 'utf-8')
    const undeclared = await auditFileScope(code, relPath)

    if (undeclared.length > 0) {
      totalErrors++
      console.error(`[AUDIT ERROR] ${relPath} has undeclared variables:`, undeclared)
    } else {
      console.log(`[AUDIT PASSED] ${relPath}: 100% clean scope and declared variables.`)
    }
  }

  console.log(`--- Scope Audit Completed (${files.length} files checked, ${totalErrors} files with errors) ---`)
  if (totalErrors > 0) {
    process.exit(1)
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  runCliAudit().catch((err) => {
    console.error('[AUDIT FATAL]', err)
    process.exit(1)
  })
}
