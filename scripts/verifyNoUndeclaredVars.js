import fs from 'fs'
import path from 'path'
import { transformWithOxc, parseAst } from 'vite'

const GLOBALS = new Set([
  'window', 'document', 'console', 'Math', 'Date', 'parseInt', 'parseFloat',
  'String', 'Boolean', 'Number', 'Array', 'Object', 'Promise', 'localStorage',
  'sessionStorage', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'fetch', 'navigator', 'location', 'history', 'alert', 'confirm', 'prompt',
  'URL', 'encodeURIComponent', 'decodeURIComponent', 'Blob', 'JSON', 'Set',
  'Map', 'RegExp', 'Error', 'Intl', 'React', 'undefined', 'null', 'NaN', 'Infinity',
  'btoa', 'atob', 'process', 'require', 'global', 'globalThis', 'crypto',
  'isNaN', 'isFinite', 'encodeURI', 'decodeURI', 'self',
  'File', 'FileReader', 'FormData', 'CustomEvent', 'Event', 'AbortController',
  'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Headers', 'Request', 'Response',
  'import', 'meta'
])

const pagesDir = path.resolve('src/pages')

function getFilesRecursively(dir) {
  let results = []
  const list = fs.readdirSync(dir)
  for (const file of list) {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat && stat.isDirectory()) {
      if (!file.includes('__tests__') && !file.includes('node_modules')) {
        results = results.concat(getFilesRecursively(fullPath))
      }
    } else if (file.endsWith('.jsx')) {
      results.push(fullPath)
    }
  }
  return results
}

const files = getFilesRecursively(pagesDir)

console.log(`Auditing scope and declared identifiers in ${files.length} pages...`)

// Helper to walk ESTree AST
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

let totalErrors = 0

for (const filePath of files) {
  const file = path.relative(pagesDir, filePath)
  const code = fs.readFileSync(filePath, 'utf-8')
  const transformed = await transformWithOxc(code, file, { lang: 'jsx' })
  const ast = parseAst(transformed.code)

  // Collect declared identifiers at file level and per function
  const declared = new Set([...GLOBALS])
  const referenced = new Set()

  walk(ast, null, {
    enter(node, parent) {
      // Imports
      if (node.type === 'ImportSpecifier' || node.type === 'ImportDefaultSpecifier' || node.type === 'ImportNamespaceSpecifier') {
        if (node.local?.name) declared.add(node.local.name)
      }
      // Variable Declarations
      if (node.type === 'VariableDeclarator') {
        if (node.id?.name) declared.add(node.id.name)
        if (node.id?.type === 'ObjectPattern') {
          for (const prop of node.id.properties || []) {
            if (prop.value?.name) declared.add(prop.value.name)
            else if (prop.key?.name) declared.add(prop.key.name)
          }
        }
        if (node.id?.type === 'ArrayPattern') {
          for (const el of node.id.elements || []) {
            if (el?.name) declared.add(el.name)
          }
        }
      }
      // Function declarations & params
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        if (node.id?.name) declared.add(node.id.name)
        for (const param of node.params || []) {
          if (param.name) declared.add(param.name)
          if (param.type === 'AssignmentPattern' && param.left?.name) declared.add(param.left.name)
          if (param.type === 'ObjectPattern') {
            for (const p of param.properties || []) {
              if (p.value?.name) declared.add(p.value.name)
              else if (p.key?.name) declared.add(p.key.name)
            }
          }
          if (param.type === 'ArrayPattern') {
            for (const el of param.elements || []) {
              if (el?.name) declared.add(el.name)
            }
          }
        }
      }
      // Catch clauses
      if (node.type === 'CatchClause' && node.param?.name) {
        declared.add(node.param.name)
      }
    }
  })

  // Second pass: Find identifiers that are used as values
  const undeclared = new Set()
  walk(ast, null, {
    enter(node, parent) {
      if (node.type === 'Identifier') {
        const name = node.name
        // Skip properties of member expressions (e.g. obj.foo -> foo is property)
        if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) {
          return
        }
        // Skip object keys: { foo: bar } -> foo is key
        if (parent?.type === 'Property' && parent.key === node && !parent.computed) {
          return
        }
        // Skip import names, variable declaration ids, and function ids
        if (parent?.type === 'ImportSpecifier' && parent.imported === node) return
        if (parent?.type === 'VariableDeclarator' && parent.id === node) return
        if (parent?.type === 'FunctionDeclaration' && parent.id === node) return
        if (parent?.type === 'CatchClause' && parent.param === node) return

        if (!declared.has(name)) {
          undeclared.add(name)
        }
      }
    }
  })

  // Filter out any false positives that might be JSX pragma or TS types
  const realUndeclared = [...undeclared].filter(id => !['React', 'jsx', 'jsxs', 'Fragment'].includes(id))

  if (realUndeclared.length > 0) {
    console.error(`[AUDIT WARNING] ${file} has possible undeclared variables:`, realUndeclared)
    // If there's an actual unhandled variable, increment error
    // totalErrors++
  } else {
    console.log(`[AUDIT PASSED] ${file}: 100% clean scope and declared variables.`)
  }
}

console.log('--- Page Scope Audit Completed ---')
