import { transformWithOxc, parseAst } from 'vite'

const JSX_RUNTIME_CALLEES = new Set(['jsx', 'jsxs', 'jsxDEV', '_jsx', '_jsxs', '_jsxDEV'])

function walkAst(node, parent, visitors) {
  if (!node || typeof node !== 'object') return
  if (visitors.enter) visitors.enter(node, parent)
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) walkAst(item, node, visitors)
    } else if (child && typeof child === 'object') {
      walkAst(child, node, visitors)
    }
  }
  if (visitors.leave) visitors.leave(node, parent)
}

function getCalleeName(callee) {
  if (!callee) return null
  if (callee.type === 'Identifier') return callee.name
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property?.type === 'Identifier') {
    const objName = callee.object?.type === 'Identifier' ? callee.object.name : null
    return objName ? `${objName}.${callee.property.name}` : callee.property.name
  }
  return null
}

function isJsxFactoryCall(node) {
  if (node?.type !== 'CallExpression') return false
  const name = getCalleeName(node.callee)
  if (!name) return false
  return JSX_RUNTIME_CALLEES.has(name) || name === 'React.createElement' || name === 'createElement'
}

function isEventPropName(keyName) {
  return typeof keyName === 'string' && /^on[A-Z]/.test(keyName)
}

function collectExpressionTokens(node, { identifiers, stringLiterals, calls }) {
  if (!node || typeof node !== 'object') return
  walkAst(node, null, {
    enter(cur, parent) {
      if (cur.type === 'Identifier') {
        const isPropKey = parent?.type === 'Property' && parent.key === cur && !parent.computed
        const isVarId = parent?.type === 'VariableDeclarator' && parent.id === cur
        const isFnId = (parent?.type === 'FunctionDeclaration' || parent?.type === 'FunctionExpression') && parent.id === cur
        const isImportSpec = parent?.type === 'ImportSpecifier' && parent.imported === cur
        if (!isPropKey && !isVarId && !isFnId && !isImportSpec) {
          identifiers.add(cur.name)
        }
        // MemberExpression non-computed property (e.g., form.platNomor, item.qty)
        if (parent?.type === 'MemberExpression' && parent.property === cur && !parent.computed) {
          identifiers.add(cur.name)
        }
      }

      if (cur.type === 'Property' && cur.key?.type === 'Identifier' && !cur.computed) {
        // Object literal keys inside payload/prop expressions (excluding useState default literal handled separately)
        identifiers.add(cur.key.name)
      }

      if (cur.type === 'Literal' && typeof cur.value === 'string') {
        stringLiterals.add(cur.value)
      }

      if (cur.type === 'TemplateElement' && typeof cur.value?.cooked === 'string' && cur.value.cooked.length > 0) {
        stringLiterals.add(cur.value.cooked)
      }

      if (cur.type === 'CallExpression') {
        const name = getCalleeName(cur.callee)
        if (name) {
          const shortName = name.includes('.') ? name.split('.').pop() : name
          calls.add(shortName)
          calls.add(name)
        }
      }
    }
  })
}

export async function analyzeJsxSource(code, filename = 'component.jsx') {
  const lang = filename.endsWith('.jsx') ? 'jsx' : 'js'
  const transformed = await transformWithOxc(code, filename, { lang })
  const ast = parseAst(transformed.code)

  const renderedComponents = new Set()
  const jsxBoundIdentifiers = new Set()
  const jsxStringLiterals = new Set()
  const jsxEventHandlers = new Set()
  const runtimeCallTargets = new Set()
  const activeRuntimeIdentifiers = new Set()
  const activePayloadIdentifiers = new Set()
  const runtimeStringLiterals = new Set()

  // Walk module AST while ignoring dead initial literals inside top-level VariableDeclarator useState(...)
  walkAst(ast, null, {
    enter(node, parent) {
      // 1. Collect all string literals & template chunks from AST (comments never produce AST nodes)
      if (node.type === 'Literal' && typeof node.value === 'string') {
        runtimeStringLiterals.add(node.value)
      }
      if (node.type === 'TemplateElement') {
        if (typeof node.value?.cooked === 'string' && node.value.cooked.length > 0) {
          runtimeStringLiterals.add(node.value.cooked)
        }
      }
      if (node.type === 'TemplateLiteral') {
        const rawJoined = (node.quasis || []).map((q) => q.value?.cooked || '').join('')
        if (rawJoined) runtimeStringLiterals.add(rawJoined)
      }

      // 2. Collect non-declaration identifier usages & call targets
      if (node.type === 'Identifier') {
        const isImport =
          parent?.type === 'ImportSpecifier' ||
          parent?.type === 'ImportDefaultSpecifier' ||
          parent?.type === 'ImportNamespaceSpecifier'
        const isVarId = parent?.type === 'VariableDeclarator' && parent.id === node
        const isFnId =
          (parent?.type === 'FunctionDeclaration' || parent?.type === 'FunctionExpression') &&
          parent.id === node
        const isPropKey = parent?.type === 'Property' && parent.key === node && !parent.computed

        if (!isImport && !isVarId && !isFnId && !isPropKey) {
          activeRuntimeIdentifiers.add(node.name)
        }
        if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) {
          activeRuntimeIdentifiers.add(node.name)
        }
      }

      if (node.type === 'CallExpression') {
        const calleeName = getCalleeName(node.callee)
        if (calleeName) {
          const shortName = calleeName.includes('.') ? calleeName.split('.').pop() : calleeName
          runtimeCallTargets.add(shortName)
          runtimeCallTargets.add(calleeName)

          // Capture object payload keys & identifiers passed to service/setter/mutation/hook calls (excluding useState default value)
          if (shortName !== 'useState' && !JSX_RUNTIME_CALLEES.has(shortName)) {
            for (const arg of node.arguments || []) {
              collectExpressionTokens(arg, {
                identifiers: activePayloadIdentifiers,
                stringLiterals: runtimeStringLiterals,
                calls: runtimeCallTargets
              })
            }
          }
        }
      }

      // 3. Extract compiled JSX calls: _jsx(Component, props), _jsxs(Component, props), React.createElement(...)
      if (isJsxFactoryCall(node)) {
        const [typeArg, propsArg, ...restArgs] = node.arguments || []

        if (typeArg?.type === 'Identifier') {
          renderedComponents.add(typeArg.name)
          jsxBoundIdentifiers.add(typeArg.name)
        } else if (typeArg?.type === 'MemberExpression' && typeArg.property?.type === 'Identifier') {
          renderedComponents.add(typeArg.property.name)
          if (typeArg.object?.type === 'Identifier') {
            renderedComponents.add(`${typeArg.object.name}.${typeArg.property.name}`)
            renderedComponents.add(typeArg.object.name)
          }
        } else if (typeArg?.type === 'Literal' && typeof typeArg.value === 'string') {
          jsxStringLiterals.add(typeArg.value)
        }

        if (propsArg?.type === 'ObjectExpression') {
          for (const prop of propsArg.properties || []) {
            if (!prop || prop.type !== 'Property') {
              if (prop) {
                collectExpressionTokens(prop, {
                  identifiers: jsxBoundIdentifiers,
                  stringLiterals: jsxStringLiterals,
                  calls: jsxEventHandlers
                })
              }
              continue
            }

            const propKey =
              prop.key?.type === 'Identifier'
                ? prop.key.name
                : prop.key?.type === 'Literal'
                  ? String(prop.key.value)
                  : null

            if (isEventPropName(propKey)) {
              // Event prop directly referencing handler: onClick={handleConfirmVoid} or onClick={form.onSubmit}
              if (prop.value?.type === 'Identifier') {
                jsxEventHandlers.add(prop.value.name)
              } else if (
                prop.value?.type === 'MemberExpression' &&
                prop.value.property?.type === 'Identifier'
              ) {
                jsxEventHandlers.add(prop.value.property.name)
              }
              // Collect handlers called inside inline arrow functions: onClick={() => handleSave()}
              collectExpressionTokens(prop.value, {
                identifiers: jsxBoundIdentifiers,
                stringLiterals: jsxStringLiterals,
                calls: jsxEventHandlers
              })
            } else {
              // Regular JSX prop (value, checked, defaultValue, items, onSubmit prop passed with custom name, children, id, to, etc.)
              collectExpressionTokens(prop.value, {
                identifiers: jsxBoundIdentifiers,
                stringLiterals: jsxStringLiterals,
                calls: jsxEventHandlers
              })
              if (propKey === 'id' && prop.value?.type === 'Literal' && typeof prop.value.value === 'string') {
                jsxStringLiterals.add(prop.value.value)
              }
            }
          }
        }

        for (const extraArg of restArgs) {
          collectExpressionTokens(extraArg, {
            identifiers: jsxBoundIdentifiers,
            stringLiterals: jsxStringLiterals,
            calls: jsxEventHandlers
          })
        }
      }
    }
  })

  return {
    renderedComponents,
    jsxBoundIdentifiers,
    jsxStringLiterals,
    jsxEventHandlers,
    runtimeCallTargets,
    activeRuntimeIdentifiers,
    activePayloadIdentifiers,
    runtimeStringLiterals
  }
}

export async function validateContractWithAst(contract, fileEntries) {
  const aggregate = {
    renderedComponents: new Set(),
    jsxBoundIdentifiers: new Set(),
    jsxStringLiterals: new Set(),
    jsxEventHandlers: new Set(),
    runtimeCallTargets: new Set(),
    activeRuntimeIdentifiers: new Set(),
    activePayloadIdentifiers: new Set(),
    runtimeStringLiterals: new Set()
  }

  for (const entry of fileEntries || []) {
    const analysis = await analyzeJsxSource(entry.code || '', entry.file || 'component.jsx')
    for (const key of Object.keys(aggregate)) {
      for (const item of analysis[key]) {
        aggregate[key].add(item)
      }
    }
  }

  const missingTabs = []
  for (const tab of contract.requiredTabs || []) {
    const hasExactLiteral =
      aggregate.runtimeStringLiterals.has(tab) || aggregate.jsxStringLiterals.has(tab)
    if (!hasExactLiteral) {
      missingTabs.push(tab)
    }
  }

  const unrenderedComponents = []
  for (const comp of contract.requiredRenderedComponents || []) {
    if (!aggregate.renderedComponents.has(comp)) {
      unrenderedComponents.push(comp)
    }
  }

  const missingSections = []
  for (const section of contract.requiredSections || []) {
    const inRuntimeIds = aggregate.activeRuntimeIdentifiers.has(section)
    const inStrings =
      aggregate.runtimeStringLiterals.has(section) || aggregate.jsxStringLiterals.has(section)
    const inComponents = aggregate.renderedComponents.has(section)
    if (!inRuntimeIds && !inStrings && !inComponents) {
      missingSections.push(section)
    }
  }

  const missingFields = []
  for (const field of contract.requiredFields || []) {
    // Field MUST be bound inside JSX props/expressions OR sent in an active non-useState call/payload.
    // A bare `const [foo, setFoo] = useState('')` or comment `// foo` will NOT satisfy this!
    const inJsx = aggregate.jsxBoundIdentifiers.has(field) || aggregate.jsxStringLiterals.has(field)
    const inActivePayload = aggregate.activePayloadIdentifiers.has(field)
    if (!inJsx && !inActivePayload) {
      missingFields.push(field)
    }
  }

  const unwiredHandlers = []
  for (const handler of contract.requiredHandlers || []) {
    // Handler MUST be wired to a JSX event prop OR called at runtime inside component/handler logic
    const wiredInJsx =
      aggregate.jsxEventHandlers.has(handler) || aggregate.jsxBoundIdentifiers.has(handler)
    const invokedAtRuntime = aggregate.runtimeCallTargets.has(handler)
    if (!wiredInJsx && !invokedAtRuntime) {
      unwiredHandlers.push(handler)
    }
  }

  let missingPrintContract = false
  if (contract.requiredPrintContract) {
    const token = contract.requiredPrintContract
    const hasPrintId =
      aggregate.jsxStringLiterals.has(token) ||
      aggregate.runtimeStringLiterals.has(token) ||
      aggregate.runtimeCallTargets.has(token)
    if (!hasPrintId) {
      missingPrintContract = true
    }
  }

  const passed =
    missingTabs.length === 0 &&
    unrenderedComponents.length === 0 &&
    missingSections.length === 0 &&
    missingFields.length === 0 &&
    unwiredHandlers.length === 0 &&
    !missingPrintContract

  return {
    passed,
    missingTabs,
    unrenderedComponents,
    missingSections,
    missingFields,
    unwiredHandlers,
    missingPrintContract
  }
}
