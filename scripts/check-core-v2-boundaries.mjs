import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = process.cwd()
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const SCAN_ROOTS = ['app', 'components', 'lib', 'hooks', 'scripts']
const SERVICE_ENV_NAMES = new Set([
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SERVICE_ROLE_KEY',
  'AFEX_CORE_V2_DATABASE_URL',
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
])
const LEDGERS = new Set([
  'atomic_authorization_contexts',
  'atomic_order_commands',
  'atomic_order_command_payloads',
  'core_v2_outbox',
])

const normalize = (value) => value.replaceAll('\\', '/')

function walk(relativeDirectory) {
  const absolute = path.join(root, relativeDirectory)
  if (!fs.existsSync(absolute)) return []
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git') return []
    const relative = normalize(path.join(relativeDirectory, entry.name))
    if (entry.isDirectory()) return walk(relative)
    return EXTENSIONS.includes(path.extname(entry.name)) ? [relative] : []
  })
}

function sourceFile(file, source) {
  const kind =
    file.endsWith('.tsx') || file.endsWith('.jsx')
      ? ts.ScriptKind.TSX
      : file.endsWith('.js') ||
          file.endsWith('.mjs') ||
          file.endsWith('.cjs')
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
}

function literalModule(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text
  return null
}

function importsOf(ast) {
  const imports = []
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      const specifier = literalModule(node.moduleSpecifier)
      if (specifier) imports.push({
        specifier,
        node: node.moduleSpecifier,
        kind: ts.isExportDeclaration(node) ? 'export-from' : 'static',
      })
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments.length === 1
    ) {
      const specifier = literalModule(node.arguments[0])
      if (specifier) imports.push({
        specifier,
        node: node.arguments[0],
        kind: ts.isIdentifier(node.expression)
          ? 'require'
          : ts.isNoSubstitutionTemplateLiteral(node.arguments[0])
            ? 'static-template'
            : 'dynamic-literal',
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return imports
}

function hasUseClientDirective(ast) {
  for (const statement of ast.statements) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression)
    ) {
      if (statement.expression.text === 'use client') return true
      continue
    }
    break
  }
  return false
}

function candidates(base) {
  if (EXTENSIONS.includes(path.extname(base))) return [base]
  return [
    ...EXTENSIONS.map((extension) => `${base}${extension}`),
    ...EXTENSIONS.map((extension) => normalize(path.join(base, `index${extension}`))),
  ]
}

function resolveImport(from, specifier, files) {
  let base
  if (specifier.startsWith('@/')) base = specifier.slice(2)
  else if (specifier.startsWith('.'))
    base = normalize(path.join(path.dirname(from), specifier))
  else return null
  return candidates(normalize(base)).find((candidate) => files.has(candidate)) ?? null
}

function location(ast, node) {
  const position = ast.getLineAndCharacterOfPosition(node.getStart(ast))
  return { line: position.line + 1, column: position.character + 1 }
}

function isProcessEnv(node, aliases) {
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process' &&
    node.name.text === 'env'
  )
    return true
  if (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process' &&
    literalModule(node.argumentExpression)?.toLowerCase() === 'env'
  )
    return true
  return ts.isIdentifier(node) && aliases.has(node.text)
}

function environmentFindings(ast) {
  const aliases = new Set()
  const findings = []
  function collect(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isProcessEnv(node.initializer, aliases)
    )
      aliases.add(node.name.text)
    ts.forEachChild(node, collect)
  }
  collect(ast)
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      isProcessEnv(node.initializer, aliases)
    ) {
      for (const element of node.name.elements) {
        const key = element.propertyName ?? element.name
        if (ts.isIdentifier(key) && SERVICE_ENV_NAMES.has(key.text))
          findings.push({ node: key, name: key.text, computed: false })
      }
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      isProcessEnv(node.expression, aliases) &&
      SERVICE_ENV_NAMES.has(node.name.text)
    )
      findings.push({ node: node.name, name: node.name.text, computed: false })
    if (
      ts.isElementAccessExpression(node) &&
      isProcessEnv(node.expression, aliases)
    ) {
      const name = literalModule(node.argumentExpression)
      if (name && SERVICE_ENV_NAMES.has(name))
        findings.push({
          node: node.argumentExpression,
          name,
          computed: false,
        })
      else if (!name)
        findings.push({
          node: node.argumentExpression,
          name: '<computed>',
          computed: true,
        })
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return findings
}

function adapterPolicyFindings(ast) {
  const findings = []
  const classNames = new Set()
  const aliases = new Map()
  function precollect(node) {
    if (ts.isClassDeclaration(node) && node.name) classNames.add(node.name.text)
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
      (ts.isIdentifier(node.initializer) || ts.isClassExpression(node.initializer)))
      aliases.set(node.name.text, ts.isIdentifier(node.initializer) ? node.initializer.text : node.name.text)
    ts.forEachChild(node, precollect)
  }
  precollect(ast)
  let changed = true
  while (changed) {
    changed = false
    for (const [alias, source] of aliases) {
      if (!classNames.has(alias) && classNames.has(source)) {
        classNames.add(alias)
        changed = true
      }
    }
  }
  const isClassValue = (node) =>
    ts.isClassExpression(node) || (ts.isIdentifier(node) && classNames.has(node.text))
  const returnExpressions = (node) => {
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return [node.body]
    if (!node.body || !ts.isBlock(node.body)) return []
    const values = []
    const inspect = (child) => {
      if (child !== node.body && ts.isFunctionLike(child)) return
      if (ts.isReturnStatement(child) && child.expression) values.push(child.expression)
      ts.forEachChild(child, inspect)
    }
    inspect(node.body)
    return values
  }
  const add = (node, label) => findings.push({ node, label })
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'eval')
      add(node, 'eval')
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
      ['Function', 'Proxy'].includes(node.expression.text)) add(node, `new ${node.expression.text}`)
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Proxy')
      add(node, 'Proxy')
    if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      ts.isIdentifier(node.expression) && node.expression.text === 'Reflect') add(node, 'Reflect capability access')
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'Object' &&
      ['assign', 'setPrototypeOf', 'defineProperty', 'defineProperties'].includes(node.expression.name.text))
      add(node, `Object.${node.expression.name.text}`)
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      (node.arguments.length !== 1 || literalModule(node.arguments[0]) === null)) add(node, 'nonliteral dynamic import')
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
      [ts.SyntaxKind.AnyKeyword, ts.SyntaxKind.UnknownKeyword].includes(node.type.kind))
      add(node, `${ts.SyntaxKind[node.type.kind]} cast`)
    if ((ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined)?.length) add(node, 'decorator')
    if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) &&
      node.heritageClauses?.some((clause) => clause.types.some((type) => ts.isCallExpression(type.expression))))
      add(node, 'mixin-generated class surface')
    if (ts.isFunctionLike(node) && returnExpressions(node).some(isClassValue))
      add(node, 'class or constructor factory')
    if (ts.isArrayLiteralExpression(node) && node.elements.some((element) => isClassValue(element)))
      add(node, 'constructor stored in array or tuple')
    if (ts.isObjectLiteralExpression(node) && node.properties.some((property) =>
      (ts.isPropertyAssignment(property) && isClassValue(property.initializer)) ||
      ((ts.isMethodDeclaration(property) || ts.isGetAccessorDeclaration(property)) &&
        returnExpressions(property).some(isClassValue))))
      add(node, 'class expression or constructor factory stored in object')
    if (ts.isCallExpression(node) && node.arguments.some(isClassValue))
      add(node, 'class constructor passed through generic call surface')
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'prototype')
      add(node, 'dynamic prototype mutation')
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return findings
}

function ledgerFindings(ast) {
  const results = []
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'from' &&
      node.arguments.length === 1
    ) {
      const relation = literalModule(node.arguments[0])
      if (relation && LEDGERS.has(relation)) results.push({ node, relation })
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return results
}

const isCoreV2 = (file) => file === 'lib/core-v2/index.ts' || file.startsWith('lib/core-v2/')
const isInternalCoreV2 = (file) =>
  file.startsWith('lib/core-v2/internal/') ||
  file === 'lib/core-v2/contracts/errors.ts' ||
  file.startsWith('lib/core-v2/boundaries/')
const isTrustedRuntime = (file) =>
  /\/(?:runtime|acquisition|executor|replay)(?:\/|\.|-)/.test(`/${file}`)
const isServiceModule = (file) =>
  /(?:supabase\/admin|supabase\/service|service-role)/.test(file)
const isRoute = (file) => /^app\/.*\/route\.(?:ts|js)$/.test(file)
const isUi = (file) =>
  file.startsWith('components/') ||
  file.startsWith('hooks/') ||
  /\.(?:tsx|jsx)$/.test(file)
const isAdapter = (file) => file.startsWith('lib/core-v2/adapter/')
const isAdapterProductionBarrel = (file) =>
  file === 'lib/core-v2/index.ts' || file === 'lib/core-v2/adapter/index.ts'
const FORBIDDEN_ADAPTER_PACKAGES = /^(?:pg|postgres|postgres\.js|@vercel\/functions)(?:\/|$)/
const GENERIC_ADAPTER_MEMBERS = new Set([
  'query', 'execute', 'sql', 'raw', 'rpc', 'from', 'table', 'schema', 'transaction',
])
const APPROVED_FAKE_IMPORTERS = new Set([
  'scripts/check-core-v2-contracts.mjs',
  'scripts/core-v2-adapter-type-tests.ts',
])
const TEST_FAKE = 'lib/core-v2/adapter/internal/test-fake-transport.ts'

function staticName(node) {
  if (!node) return null
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text
  if (ts.isComputedPropertyName(node)) return literalModule(node.expression)
  return null
}

const normalizedRoleTarget = (value) =>
  /^(?:role|rolename|roletarget|targetrole|setrole|databaserole|runtimerole)$/.test(
    String(value ?? '').replace(/[_-]/g, '').toLowerCase()
  )

function allEnvironmentAccesses(ast) {
  const aliases = new Set()
  const results = []
  const isImportMetaEnv = (node) =>
    ((ts.isPropertyAccessExpression(node) && node.name.text === 'env') ||
      (ts.isElementAccessExpression(node) && literalModule(node.argumentExpression) === 'env')) &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
  const isEnvironmentObject = (node) => isProcessEnv(node, aliases) || isImportMetaEnv(node)
  function collect(node) {
    if (
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
      node.initializer && isEnvironmentObject(node.initializer)
    ) aliases.add(node.name.text)
    ts.forEachChild(node, collect)
  }
  collect(ast)
  function visit(node) {
    if (isEnvironmentObject(node)) results.push(node)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return results
}

function genericSurfaceFindings(ast) {
  const declaredInterfaces = new Map()
  const typeAliases = new Map()
  const constants = new Map()
  const enums = new Map()
  const capabilities = new Map()
  const objectCapabilities = new Map()
  const functionCapabilities = new Map()
  const callableCapabilities = new Map()
  const valueCapabilities = new Map()
  const returnedContainers = new Map()
  const returnedContainerSites = new Map()
  const containerLengths = new Map()
  const containerLengthOptions = new Map()
  const returnedClassSurfaces = new Map()
  const classIdentities = new Set()
  const findings = []
  const step = (label, node) => {
    const point = ast.getLineAndCharacterOfPosition(node.getStart(ast))
    return `${label}@${point.line + 1}:${point.character + 1}`
  }
  const record = (member, origin, site, provenance) => {
    if (!member || !GENERIC_ADAPTER_MEMBERS.has(member)) return
    findings.push({ member, origin, site, provenance })
  }
  function staticString(node, resolving = new Set()) {
    if (!node) return null
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node))
      return staticString(node.expression, resolving)
    if (ts.isNumericLiteral(node)) return node.text
    const literal = literalModule(node)
    if (literal !== null) return literal
    if (ts.isParenthesizedExpression(node)) return staticString(node.expression, resolving)
    if (ts.isIdentifier(node)) {
      if (resolving.has(node.text)) return null
      resolving.add(node.text)
      const value = constants.get(node.text)
      const result = value ? staticString(value, resolving) : null
      resolving.delete(node.text)
      return result
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const enumValue = enums.get(`${node.expression.text}.${node.name.text}`)
      if (enumValue !== undefined) return enumValue
      const initializer = constants.get(node.expression.text)
      const unwrapped = initializer && (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer))
        ? initializer.expression : initializer
      if (unwrapped && ts.isObjectLiteralExpression(unwrapped)) {
        const property = unwrapped.properties.find((entry) =>
          (ts.isPropertyAssignment(entry) || ts.isShorthandPropertyAssignment(entry)) &&
          staticName(entry.name) === node.name.text)
        if (property && ts.isPropertyAssignment(property)) return staticString(property.initializer, resolving)
      }
      return null
    }
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const key = staticString(node.argumentExpression, resolving)
      if (key && enums.has(`${node.expression.text}.${key}`)) return enums.get(`${node.expression.text}.${key}`)
      const initializer = constants.get(node.expression.text)
      const unwrapped = initializer && (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer))
        ? initializer.expression : initializer
      if (unwrapped && ts.isArrayLiteralExpression(unwrapped) && /^\d+$/.test(String(key)))
        return staticString(unwrapped.elements[Number(key)], resolving)
      if (unwrapped && ts.isObjectLiteralExpression(unwrapped)) {
        const property = unwrapped.properties.find((entry) =>
          ts.isPropertyAssignment(entry) && staticName(entry.name) === key)
        if (property && ts.isPropertyAssignment(property)) return staticString(property.initializer, resolving)
      }
      return null
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = staticString(node.left, resolving)
      const right = staticString(node.right, resolving)
      return left !== null && right !== null ? left + right : null
    }
    return null
  }
  const memberRead = (node) => {
    if (ts.isPropertyAccessExpression(node)) return { member: node.name.text, node: node.name }
    if (ts.isElementAccessExpression(node)) {
      const member = staticString(node.argumentExpression)
      return member ? { member, node: node.argumentExpression } : null
    }
    return null
  }
  function typeKeys(node, typeParameters = new Map(), resolving = new Set()) {
    if (!node) return new Set()
    if (ts.isParenthesizedTypeNode(node)) return typeKeys(node.type, typeParameters, resolving)
    if (ts.isLiteralTypeNode(node)) {
      const value = staticString(node.literal)
      return value === null ? new Set() : new Set([value])
    }
    if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node))
      return new Set(node.types.flatMap((part) => [...typeKeys(part, typeParameters, resolving)]))
    if (ts.isTypeLiteralNode(node))
      return new Set(node.members.map((member) => staticName(member.name)).filter(Boolean))
    if (ts.isMappedTypeNode(node)) return typeKeys(node.typeParameter.constraint, typeParameters, resolving)
    if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.KeyOfKeyword)
      return typeKeys(node.type, typeParameters, resolving)
    if (ts.isConditionalTypeNode(node)) {
      if (ts.isTypeReferenceNode(node.checkType) && ts.isIdentifier(node.checkType.typeName)) {
        const bound = typeParameters.get(node.checkType.typeName.text)
        if (bound === true) return typeKeys(node.trueType, typeParameters, resolving)
        if (bound === false) return typeKeys(node.falseType, typeParameters, resolving)
      }
      return new Set()
    }
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      const name = node.typeName.text
      const declaration = typeAliases.get(name)
      if (!declaration || resolving.has(name)) return new Set()
      resolving.add(name)
      const bindings = new Map(typeParameters)
      for (let index = 0; index < (declaration.typeParameters?.length ?? 0); index += 1) {
        const parameter = declaration.typeParameters[index].name.text
        const argument = node.typeArguments?.[index]
        if (argument && ts.isLiteralTypeNode(argument) && argument.literal.kind === ts.SyntaxKind.TrueKeyword) bindings.set(parameter, true)
        else if (argument && ts.isLiteralTypeNode(argument) && argument.literal.kind === ts.SyntaxKind.FalseKeyword) bindings.set(parameter, false)
      }
      const result = typeKeys(declaration.type, bindings, resolving)
      resolving.delete(name)
      return result
    }
    return new Set()
  }
  function precollect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0) constants.set(node.name.text, node.initializer)
    if (ts.isEnumDeclaration(node)) {
      for (const member of node.members) {
        const key = staticName(member.name)
        const value = staticString(member.initializer)
        if (key && value !== null) enums.set(`${node.name.text}.${key}`, value)
      }
    }
    if (ts.isInterfaceDeclaration(node)) declaredInterfaces.set(node.name.text, node)
    if (ts.isTypeAliasDeclaration(node)) typeAliases.set(node.name.text, node)
    ts.forEachChild(node, precollect)
  }
  precollect(ast)
  for (const declaration of typeAliases.values()) {
    const surfaceDeclaration =
      ts.isTypeLiteralNode(declaration.type) ||
      ts.isMappedTypeNode(declaration.type) ||
      ts.isIntersectionTypeNode(declaration.type) ||
      (ts.isTypeReferenceNode(declaration.type) && (declaration.type.typeArguments?.length ?? 0) > 0)
    if (!surfaceDeclaration) continue
    for (const key of typeKeys(declaration.type))
      record(key, declaration.name, declaration.name, [step(`type ${declaration.name.text}`, declaration.name)])
  }
  const unwrapTransparent = (node) => {
    let current = node
    while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current) || ts.isPartiallyEmittedExpression(current))) current = current.expression
    return current
  }
  const staticBoolean = (node, resolving = new Set()) => {
    const current = unwrapTransparent(node)
    if (!current) return null
    if (current.kind === ts.SyntaxKind.TrueKeyword) return true
    if (current.kind === ts.SyntaxKind.FalseKeyword) return false
    if (ts.isIdentifier(current) && !resolving.has(current.text)) {
      resolving.add(current.text)
      const result = constants.has(current.text) ? staticBoolean(constants.get(current.text), resolving) : null
      resolving.delete(current.text)
      return result
    }
    return null
  }
  const callablePaths = (node) => {
    const current = unwrapTransparent(node)
    if (!current) return []
    if (ts.isIdentifier(current)) return [current.text]
    if (ts.isNewExpression(current))
      return callablePaths(current.expression).map((base) => `${base}.prototype`)
    if (ts.isPropertyAccessExpression(current))
      return callablePaths(current.expression).map((base) => `${base}.${current.name.text}`)
    if (ts.isElementAccessExpression(current)) {
      const key = staticString(current.argumentExpression)
      return key === null ? [] : callablePaths(current.expression).map((base) => `${base}.${key}`)
    }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.CommaToken)
      return callablePaths(current.right)
    if (ts.isConditionalExpression(current)) {
      const selected = staticBoolean(current.condition)
      if (selected === true) return callablePaths(current.whenTrue)
      if (selected === false) return callablePaths(current.whenFalse)
      return [...new Set([...callablePaths(current.whenTrue), ...callablePaths(current.whenFalse)])]
    }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
      return [...new Set([...callablePaths(current.left), ...callablePaths(current.right)])]
    if (ts.isCallExpression(current))
      return [...new Set(callablePaths(current.expression).flatMap((path) =>
        returnedClassSurfaces.has(path) ? [returnedClassSurfaces.get(path)] : []))]
    return []
  }
  const callablePath = (node) => callablePaths(node)[0] ?? null
  const resolvedDeclarationName = (node) =>
    !node ? null : ts.isComputedPropertyName(node)
      ? staticString(node.expression)
      : staticName(node)
  const unwrapStaticExpression = (node) => {
    let current = node
    while (current && (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current))) current = current.expression
    return current
  }
  function provenanceOf(node) {
    const read = memberRead(node)
    if (read && GENERIC_ADAPTER_MEMBERS.has(read.member))
      return { member: read.member, origin: read.node, chain: [step(`member ${read.member}`, read.node)] }
    for (const valuePath of callablePaths(node))
      if (valueCapabilities.has(valuePath)) return valueCapabilities.get(valuePath)
    if (ts.isIdentifier(node)) return capabilities.get(node.text) ?? objectCapabilities.get(node.text) ?? functionCapabilities.get(node.text) ?? null
    if (ts.isCallExpression(node)) {
      for (const key of callablePaths(node.expression)) {
        const source = callableCapabilities.get(key) ?? functionCapabilities.get(key)
        if (source) return { ...source, chain: [...source.chain, step(`call ${key}`, node.expression)] }
      }
    }
    return null
  }
  const functionReturnProvenance = (node) => {
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return provenanceOf(node.body)
    if (!node.body || !ts.isBlock(node.body)) return null
    let result = null
    const inspect = (child) => {
      if (result) return
      if (child !== node.body && ts.isFunctionLike(child)) return
      if (ts.isReturnStatement(child) && child.expression) {
        result = provenanceOf(child.expression)
        return
      }
      ts.forEachChild(child, inspect)
    }
    inspect(node.body)
    return result
  }
  const functionReturnArray = (node) => {
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
      const expression = unwrapStaticExpression(node.body)
      return expression && ts.isArrayLiteralExpression(expression) ? expression : null
    }
    if (!node.body || !ts.isBlock(node.body)) return null
    let result = null
    const inspect = (child) => {
      if (result) return
      if (child !== node.body && ts.isFunctionLike(child)) return
      const expression = ts.isReturnStatement(child) && child.expression
        ? unwrapStaticExpression(child.expression) : null
      if (expression && ts.isArrayLiteralExpression(expression)) {
        result = expression
        return
      }
      ts.forEachChild(child, inspect)
    }
    inspect(node.body)
    return result
  }
  const functionReturnExpression = (node) => {
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return unwrapStaticExpression(node.body)
    if (!node.body || !ts.isBlock(node.body)) return null
    let result = null
    const inspect = (child) => {
      if (result) return
      if (child !== node.body && ts.isFunctionLike(child)) return
      if (ts.isReturnStatement(child) && child.expression) {
        result = unwrapStaticExpression(child.expression)
        return
      }
      ts.forEachChild(child, inspect)
    }
    inspect(node.body)
    return result
  }
  const registerCallable = (key, node, label) => {
    if (!key) return false
    let added = false
    const source = functionReturnProvenance(node)
    if (source && !callableCapabilities.has(key)) {
      callableCapabilities.set(key, {
        ...source,
        site: node.name ?? node,
        chain: [...source.chain, step(label, node.name ?? node)],
      })
      added = true
    }
    const returnedArray = functionReturnArray(node)
    if (returnedArray && !returnedContainers.has(key)) {
      returnedContainers.set(key, returnedArray)
      returnedContainerSites.set(key, functionReturnExpression(node) ?? returnedArray)
      added = true
    }
    return added
  }
  const lengthOptions = (base) =>
    containerLengthOptions.get(base) ??
    (Number.isInteger(containerLengths.get(base)) ? new Set([containerLengths.get(base)]) : new Set())
  const setLengthOptions = (base, values) => {
    const normalized = [...new Set(values)].sort((left, right) => left - right)
    const previous = [...(containerLengthOptions.get(base) ?? [])]
    if (previous.length === normalized.length && previous.every((value, index) => value === normalized[index])) return false
    containerLengthOptions.set(base, new Set(normalized))
    if (normalized.length === 1) containerLengths.set(base, normalized[0])
    else containerLengths.delete(base)
    return true
  }
  const registerArrayCallables = (base, array) => {
    let added = false
    let outputOffsets = new Set([0])
    for (const element of array.elements) {
      if (ts.isSpreadElement(element)) {
        const nextOffsets = new Set()
        const spreadSources = callablePaths(element.expression).map((sourceBase) => ({ sourceBase, returnedFrom: null }))
        const spreadExpression = unwrapStaticExpression(element.expression)
        if (spreadExpression && ts.isCallExpression(spreadExpression)) {
          for (const called of callablePaths(spreadExpression.expression)) {
            const returned = returnedContainers.get(called)
            if (!returned) continue
            const synthetic = `${base}.$returned.${called}`
            if (registerArrayCallables(synthetic, returned)) added = true
            spreadSources.push({ sourceBase: synthetic, returnedFrom: called })
          }
        }
        for (const { sourceBase, returnedFrom } of spreadSources) {
          for (const length of lengthOptions(sourceBase)) {
            for (const outputIndex of outputOffsets) {
              for (let sourceIndex = 0; sourceIndex < length; sourceIndex += 1) {
                const sourceKey = `${sourceBase}.${sourceIndex}`
                const key = `${base}.${outputIndex + sourceIndex}`
                const callable = callableCapabilities.get(sourceKey)
                if (callable && !callableCapabilities.has(key)) {
                  callableCapabilities.set(key, {
                    ...callable,
                    chain: [
                      ...callable.chain,
                      ...(returnedFrom ? [step(`return container ${returnedFrom}`, returnedContainerSites.get(returnedFrom) ?? element.expression)] : []),
                      step(`spread ${sourceKey} as ${key} alternative ${sourceBase}`, element),
                    ],
                  }); added = true
                }
                const value = valueCapabilities.get(sourceKey)
                if (value && !valueCapabilities.has(key)) {
                  valueCapabilities.set(key, {
                    ...value,
                    chain: [
                      ...value.chain,
                      ...(returnedFrom ? [step(`return container ${returnedFrom}`, returnedContainerSites.get(returnedFrom) ?? element.expression)] : []),
                      step(`spread value ${sourceKey} as ${key} alternative ${sourceBase}`, element),
                    ],
                  }); added = true
                }
              }
              nextOffsets.add(outputIndex + length)
            }
          }
        }
        outputOffsets = nextOffsets
        continue
      }
      for (const outputIndex of outputOffsets) {
        const key = `${base}.${outputIndex}`
        const unwrappedElement = unwrapStaticExpression(element)
        if (unwrappedElement && (ts.isFunctionExpression(unwrappedElement) || ts.isArrowFunction(unwrappedElement)))
          added = registerCallable(key, unwrappedElement, `indexed function ${key}`) || added
        else if (unwrappedElement && ts.isArrayLiteralExpression(unwrappedElement))
          added = registerArrayCallables(key, unwrappedElement) || added
        else {
          const direct = provenanceOf(element)
          if (direct && !callableCapabilities.has(key)) {
            callableCapabilities.set(key, {
              ...direct,
              chain: [...direct.chain, step(`indexed capability ${key}`, element)],
            }); added = true
          } else {
            for (const sourcePath of callablePaths(element)) {
              const callable = callableCapabilities.get(sourcePath)
              if (callable && !callableCapabilities.has(key)) {
                callableCapabilities.set(key, {
                  ...callable,
                  chain: [...callable.chain, step(`indexed alias ${key}`, element)],
                }); added = true
                break
              }
            }
          }
        }
      }
      outputOffsets = new Set([...outputOffsets].map((offset) => offset + 1))
    }
    added = setLengthOptions(base, outputOffsets) || added
    return added
  }
  const registerObjectCallables = (base, object) => {
    let added = false
    for (const property of object.properties) {
      if (ts.isSpreadAssignment(property)) continue
      const name = resolvedDeclarationName(property.name)
      if (!name) continue
      const key = `${base}.${name}`
      if (ts.isMethodDeclaration(property)) added = registerCallable(key, property, `method ${key}`) || added
      if (ts.isGetAccessorDeclaration(property)) {
        const source = functionReturnProvenance(property)
        if (source && !valueCapabilities.has(key)) {
          valueCapabilities.set(key, {
            ...source,
            chain: [...source.chain, step(`getter ${key}`, property.name)],
          })
          added = true
        }
      }
      if (ts.isPropertyAssignment(property)) {
        const initializer = unwrapStaticExpression(property.initializer)
        if (initializer && (ts.isFunctionExpression(initializer) || ts.isArrowFunction(initializer)))
          added = registerCallable(key, initializer, `function property ${key}`) || added
        if (initializer && ts.isObjectLiteralExpression(initializer))
          added = registerObjectCallables(key, initializer) || added
        if (initializer && ts.isArrayLiteralExpression(initializer))
          added = registerArrayCallables(key, initializer) || added
      }
    }
    return added
  }
  const copySurfaceAliases = (sourceBase, destinationBase, node, label) => {
    if (!sourceBase || !destinationBase || sourceBase === destinationBase) return false
    let added = false
    for (const [key, source] of [...callableCapabilities]) {
      if (!key.startsWith(`${sourceBase}.`)) continue
      const destination = `${destinationBase}${key.slice(sourceBase.length)}`
      if (!callableCapabilities.has(destination)) {
        callableCapabilities.set(destination, {
          ...source,
          chain: [...source.chain, step(`${label} ${sourceBase} as ${destinationBase}`, node)],
        }); added = true
      }
    }
    for (const [key, source] of [...valueCapabilities]) {
      if (!key.startsWith(`${sourceBase}.`)) continue
      const destination = `${destinationBase}${key.slice(sourceBase.length)}`
      if (!valueCapabilities.has(destination)) {
        valueCapabilities.set(destination, {
          ...source,
          chain: [...source.chain, step(`${label} ${sourceBase} as ${destinationBase}`, node)],
        }); added = true
      }
    }
    if (containerLengths.has(sourceBase) && !containerLengths.has(destinationBase)) {
      containerLengths.set(destinationBase, containerLengths.get(sourceBase))
      added = true
    }
    if (containerLengthOptions.has(sourceBase) && !containerLengthOptions.has(destinationBase)) {
      containerLengthOptions.set(destinationBase, new Set(containerLengthOptions.get(sourceBase)))
      added = true
    }
    return added
  }
  const qualifiedClassName = (node, fallback) => {
    const parts = [fallback]
    let current = node.parent
    while (current) {
      if (ts.isModuleBlock(current) && ts.isModuleDeclaration(current.parent)) {
        const name = staticName(current.parent.name)
        if (name) parts.unshift(name)
      }
      current = current.parent
    }
    return parts.join('.')
  }
  const registerClass = (identity, node) => {
    if (!identity) return false
    let added = false
    if (!classIdentities.has(identity)) {
      classIdentities.add(identity)
      added = true
    }
    const declaredInstanceNames = new Set(node.members
      .filter((member) => !(member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) ?? false))
      .map((member) => resolvedDeclarationName(member.name)).filter(Boolean))
    const declaredStaticNames = new Set(node.members
      .filter((member) => member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) ?? false)
      .map((member) => resolvedDeclarationName(member.name)).filter(Boolean))
    const baseType = node.heritageClauses?.flatMap((clause) => clause.types)[0]
    const baseName = baseType ? callablePath(baseType.expression) : null
    const inherit = (map, instance, getter) => {
      if (!baseName) return
      const prefix = instance ? `${baseName}.prototype.` : `${baseName}.`
      for (const [key, source] of [...map]) {
        if (!key.startsWith(prefix) || (!instance && key.startsWith(`${baseName}.prototype.`))) continue
        const memberName = key.slice(prefix.length)
        const declaredNames = instance ? declaredInstanceNames : declaredStaticNames
        if (memberName.includes('.') || declaredNames.has(memberName)) continue
        const destinationPrefix = instance ? `${identity}.prototype.` : `${identity}.`
        const destination = `${destinationPrefix}${memberName}`
        if (!map.has(destination)) {
          map.set(destination, {
            ...source,
            chain: [...source.chain, step(`inherit ${getter ? 'getter ' : ''}${baseName}.${memberName} as ${identity}.${memberName}`, node.name ?? node)],
          }); added = true
        }
      }
    }
    inherit(callableCapabilities, true, false)
    inherit(callableCapabilities, false, false)
    inherit(valueCapabilities, true, true)
    inherit(valueCapabilities, false, true)
    for (const member of node.members) {
      const name = resolvedDeclarationName(member.name)
      if (!name) continue
      const isStatic = member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) ?? false
      const key = isStatic ? `${identity}.${name}` : `${identity}.prototype.${name}`
      if (ts.isMethodDeclaration(member) && registerCallable(key, member, `class ${isStatic ? 'static ' : ''}method ${identity}.${name}`)) added = true
      if (ts.isGetAccessorDeclaration(member)) {
        const source = functionReturnProvenance(member)
        if (source && !valueCapabilities.has(key)) {
          valueCapabilities.set(key, {
            ...source,
            chain: [...source.chain, step(`class ${isStatic ? 'static ' : ''}getter ${identity}.${name}`, member.name)],
          }); added = true
        }
      }
      if (ts.isPropertyDeclaration(member) && member.initializer &&
        (ts.isFunctionExpression(member.initializer) || ts.isArrowFunction(member.initializer)) &&
        registerCallable(key, member.initializer, `class function property ${identity}.${name}`)) added = true
    }
    return added
  }
  const registerClassFactory = (key, node) => {
    const expression = functionReturnExpression(node)
    if (!expression) return false
    let source = null
    if (ts.isClassExpression(expression)) {
      source = `${key}.$returnedClass`
      registerClass(source, expression)
    } else if (ts.isCallExpression(expression)) {
      for (const called of callablePaths(expression.expression)) {
        if (returnedClassSurfaces.has(called)) {
          source = returnedClassSurfaces.get(called)
          break
        }
      }
    } else {
      source = callablePaths(expression).find((path) => classIdentities.has(path)) ?? null
    }
    if (!source || returnedClassSurfaces.get(key) === source) return false
    returnedClassSurfaces.set(key, source)
    return true
  }
  const bindArrayPattern = (pattern, base) => {
    let added = false
    for (let index = 0; index < pattern.elements.length; index += 1) {
      const element = pattern.elements[index]
      if (!ts.isBindingElement(element)) continue
      if (element.dotDotDotToken) {
        if (!ts.isIdentifier(element.name)) continue
        const destination = element.name.text
        const lengths = lengthOptions(base)
        const destinationLengths = []
        for (const length of lengths) {
          destinationLengths.push(Math.max(0, length - index))
          for (let sourceIndex = index; sourceIndex < length; sourceIndex += 1) {
            const sourceKey = `${base}.${sourceIndex}`
            const key = `${destination}.${sourceIndex - index}`
            for (const map of [callableCapabilities, valueCapabilities]) {
              const source = map.get(sourceKey)
              if (source && !map.has(key)) {
                map.set(key, {
                  ...source,
                  chain: [...source.chain, step(`tuple rest ${sourceKey} as ${key}`, element.name)],
                })
                added = true
              }
            }
          }
        }
        added = setLengthOptions(destination, destinationLengths) || added
        continue
      }
      if (ts.isArrayBindingPattern(element.name)) {
        added = bindArrayPattern(element.name, `${base}.${index}`) || added
        continue
      }
      if (!ts.isIdentifier(element.name)) continue
      const callable = callableCapabilities.get(`${base}.${index}`)
      if (callable && !callableCapabilities.has(element.name.text)) {
        const derived = {
          ...callable,
          chain: [...callable.chain, step(`destructure index ${index} as ${element.name.text}`, element.name)],
        }
        callableCapabilities.set(element.name.text, derived)
        let declaration = pattern.parent
        while (declaration && !ts.isVariableDeclaration(declaration)) declaration = declaration.parent
        const statement = declaration?.parent?.parent
        if (statement && ts.isVariableStatement(statement) &&
          statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
          record(derived.member, derived.origin, element.name,
            [...derived.chain, step(`export variable ${element.name.text}`, element.name)])
        added = true
      }
    }
    return added
  }
  let changed = true
  while (changed) {
    changed = false
    function collect(node) {
      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        const key = qualifiedClassName(node, node.name.text)
        if (registerCallable(key, node, `return ${key}`)) changed = true
        if (registerClassFactory(key, node)) changed = true
        const source = callableCapabilities.get(key)
        if (source && !functionCapabilities.has(key)) {
          functionCapabilities.set(key, source); changed = true
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const unwrappedInitializer = unwrapStaticExpression(node.initializer)
        if (unwrappedInitializer && ts.isClassExpression(unwrappedInitializer) &&
          registerClass(qualifiedClassName(node, node.name.text), unwrappedInitializer)) changed = true
        if ((ts.isFunctionExpression(node.initializer) || ts.isArrowFunction(node.initializer)) &&
          registerCallable(qualifiedClassName(node, node.name.text), node.initializer, `function ${qualifiedClassName(node, node.name.text)}`)) changed = true
        if ((ts.isFunctionExpression(node.initializer) || ts.isArrowFunction(node.initializer)) &&
          registerClassFactory(qualifiedClassName(node, node.name.text), node.initializer)) changed = true
        if (unwrappedInitializer && ts.isArrayLiteralExpression(unwrappedInitializer) && registerArrayCallables(node.name.text, unwrappedInitializer)) changed = true
        const callableSource = callableCapabilities.get(callablePath(node.initializer))
        if (callableSource && !callableCapabilities.has(node.name.text)) {
          const derivedCallable = {
            ...callableSource,
            chain: [...callableSource.chain, step(`function alias ${node.name.text}`, node.name)],
          }
          callableCapabilities.set(node.name.text, derivedCallable)
          const statement = node.parent?.parent
          if (statement && ts.isVariableStatement(statement) &&
            statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
            record(derivedCallable.member, derivedCallable.origin, node.name,
              [...derivedCallable.chain, step(`export variable ${node.name.text}`, node.name)])
          changed = true
        }
        if (!ts.isNewExpression(unwrappedInitializer))
          for (const sourcePath of callablePaths(node.initializer))
            if (copySurfaceAliases(sourcePath, node.name.text, node.name,
              ts.isCallExpression(unwrappedInitializer) ? 'factory return' : 'surface alias')) changed = true
        if (ts.isCallExpression(node.initializer)) {
          const called = callablePath(node.initializer.expression)
          const returned = called ? returnedContainers.get(called) : null
          if (returned && registerArrayCallables(node.name.text, returned)) changed = true
          const returnedClass = called ? returnedClassSurfaces.get(called) : null
          if (returnedClass && copySurfaceAliases(returnedClass, node.name.text, node.name, 'factory return')) changed = true
        }
        const source = provenanceOf(node.initializer)
        if (source && !capabilities.has(node.name.text)) {
          const derived = { ...source, chain: [...source.chain, step(`alias ${node.name.text}`, node.name)] }
          capabilities.set(node.name.text, derived)
          record(derived.member, derived.origin, node.name, derived.chain)
          changed = true
        }
        if (ts.isObjectLiteralExpression(node.initializer)) {
          if (registerObjectCallables(node.name.text, node.initializer)) changed = true
          let objectSource = null
          for (const property of node.initializer.properties) {
            if (ts.isSpreadAssignment(property)) objectSource ??= provenanceOf(property.expression)
            else if (ts.isPropertyAssignment(property)) objectSource ??= provenanceOf(property.initializer)
            else if (ts.isMethodDeclaration(property)) {
              const member = staticName(property.name)
              if (member && GENERIC_ADAPTER_MEMBERS.has(member))
                objectSource ??= { member, origin: property.name, chain: [step(`member ${member}`, property.name)] }
            }
          }
          if (objectSource && !objectCapabilities.has(node.name.text)) {
            const derived = { ...objectSource, chain: [...objectSource.chain, step(`object ${node.name.text}`, node.name)] }
            objectCapabilities.set(node.name.text, derived)
            record(derived.member, derived.origin, node.name, derived.chain)
            changed = true
          }
        } else if (ts.isIdentifier(node.initializer) && /^(?:client|connection|pool)$/i.test(node.initializer.text) && !objectCapabilities.has(node.name.text)) {
          objectCapabilities.set(node.name.text, { member: 'query', origin: node.initializer, chain: [step(`database source ${node.initializer.text}`, node.initializer), step(`alias ${node.name.text}`, node.name)] })
          changed = true
        }
        if (ts.isNewExpression(node.initializer) && ts.isIdentifier(node.initializer.expression)) {
          const classPrefix = `${node.initializer.expression.text}.prototype.`
          for (const [key, callable] of callableCapabilities) {
            if (!key.startsWith(classPrefix)) continue
            const instanceKey = `${node.name.text}.${key.slice(classPrefix.length)}`
            if (!callableCapabilities.has(instanceKey)) {
              callableCapabilities.set(instanceKey, {
                ...callable,
                chain: [...callable.chain, step(`instance ${node.name.text}`, node.name)],
              }); changed = true
            }
          }
          for (const [key, value] of valueCapabilities) {
            if (!key.startsWith(classPrefix)) continue
            const instanceKey = `${node.name.text}.${key.slice(classPrefix.length)}`
            if (!valueCapabilities.has(instanceKey)) {
              valueCapabilities.set(instanceKey, {
                ...value,
                chain: [...value.chain, step(`instance getter ${node.name.text}`, node.name)],
              }); changed = true
            }
          }
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          const member = staticName(element.propertyName ?? element.name)
          const destination = staticName(element.name)
          if (member && destination && GENERIC_ADAPTER_MEMBERS.has(member) && !capabilities.has(destination)) {
            const derived = { member, origin: element.propertyName ?? element.name, chain: [step(`member ${member}`, element.propertyName ?? element.name), step(`destructure ${destination}`, element.name)] }
            capabilities.set(destination, derived); record(member, derived.origin, element.name, derived.chain); changed = true
          }
          const base = callablePath(node.initializer)
          const callable = base && member ? callableCapabilities.get(`${base}.${member}`) : null
          if (callable && destination && !callableCapabilities.has(destination)) {
            callableCapabilities.set(destination, {
              ...callable,
              chain: [...callable.chain, step(`destructure method ${destination}`, element.name)],
            }); changed = true
          }
          const value = base && member ? valueCapabilities.get(`${base}.${member}`) : null
          if (value && destination && !capabilities.has(destination)) {
            capabilities.set(destination, {
              ...value,
              chain: [...value.chain, step(`destructure getter ${destination}`, element.name)],
            }); changed = true
          }
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)) {
        const base = callablePath(node.initializer)
        if (base && bindArrayPattern(node.name, base)) changed = true
      }
      if (ts.isClassDeclaration(node) && node.name &&
        registerClass(qualifiedClassName(node, node.name.text), node)) changed = true
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        (ts.isFunctionExpression(node.right) || ts.isArrowFunction(node.right))) {
        const key = callablePath(node.left)
        if (key && registerCallable(key, node.right, `assigned function ${key}`)) changed = true
      }
      ts.forEachChild(node, collect)
    }
    collect(ast)
  }
  for (const [name, source] of functionCapabilities)
    record(source.member, source.origin, source.site, [...source.chain, step(`function ${name}`, source.site)])
  const recordSurfaceExposure = (surfaceName, node, label) => {
    if (!surfaceName) return
    const returnedClass = returnedClassSurfaces.get(surfaceName)
    if (returnedClass && returnedClass !== surfaceName) {
      recordSurfaceExposure(returnedClass, node, `${label} from factory ${surfaceName}`)
      return
    }
    for (const [key, source] of callableCapabilities) {
      if (!key.startsWith(`${surfaceName}.`)) continue
      record(source.member, source.origin, node, [...source.chain, step(`${label} carrying ${key}`, node)])
    }
    for (const [key, source] of valueCapabilities) {
      if (!key.startsWith(`${surfaceName}.`)) continue
      record(source.member, source.origin, node, [...source.chain, step(`${label} carrying ${key}`, node)])
    }
  }
  function visit(node) {
    let ancestor = node.parent
    let insideConditionalType = false
    while (ancestor && ancestor !== ast) {
      if (ts.isConditionalTypeNode(ancestor)) {
        insideConditionalType = true
        break
      }
      ancestor = ancestor.parent
    }
    const memberName =
      ts.isMethodSignature(node) || ts.isMethodDeclaration(node) ||
      ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) ||
      ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)
        ? staticName(node.name)
        : ts.isVariableDeclaration(node) ? staticName(node.name) : null
    const typeAliasOwned = (() => {
      let parent = node.parent
      while (parent && parent !== ast) {
        if (ts.isTypeAliasDeclaration(parent)) return true
        parent = parent.parent
      }
      return false
    })()
    const objectMethodOwned = ts.isMethodDeclaration(node) && ts.isObjectLiteralExpression(node.parent)
    if (ts.isFunctionDeclaration(node) && node.name &&
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
      recordSurfaceExposure(qualifiedClassName(node, node.name.text), node.name, `export factory ${node.name.text}`)
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const statement = node.parent?.parent
      if (statement && ts.isVariableStatement(statement) &&
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
        recordSurfaceExposure(qualifiedClassName(node, node.name.text), node.name, `export factory ${node.name.text}`)
    }
    if (!insideConditionalType && !typeAliasOwned && !objectMethodOwned && memberName && GENERIC_ADAPTER_MEMBERS.has(memberName))
      record(memberName, node.name ?? node, node.name ?? node, [step(`member ${memberName}`, node.name ?? node)])
    if (!insideConditionalType && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))) {
      const read = memberRead(node)
      const parentConsumesProvenance =
        (ts.isVariableDeclaration(node.parent) && node.parent.initializer === node) ||
        (ts.isReturnStatement(node.parent) && node.parent.expression === node) ||
        (ts.isPropertyAssignment(node.parent) && node.parent.initializer === node) ||
        (ts.isBinaryExpression(node.parent) && node.parent.right === node && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken)
      if (read && !parentConsumesProvenance)
        record(read.member, read.node, read.node, [step(`member ${read.member}`, read.node)])
    }
    if (ts.isBindingElement(node)) {
      const member = staticName(node.propertyName ?? node.name)
      if (member && GENERIC_ADAPTER_MEMBERS.has(member))
        record(member, node.propertyName ?? node.name, node.name, [step(`member ${member}`, node.propertyName ?? node.name), step(`destructure ${staticName(node.name)}`, node.name)])
    }
    if (ts.isExportAssignment(node)) {
      const source = provenanceOf(node.expression)
      if (source) record(source.member, source.origin, node, [...source.chain, step('default export', node)])
      const callable = callableCapabilities.get(callablePath(node.expression))
      if (callable) record(callable.member, callable.origin, node, [...callable.chain, step('default callable export', node)])
      recordSurfaceExposure(callablePath(node.expression), node, 'default surface export')
    }
    if (ts.isExportSpecifier(node)) {
      const source = capabilities.get(node.propertyName?.text ?? node.name.text)
      if (source) record(source.member, source.origin, node.name, [...source.chain, step(`export ${node.name.text}`, node.name)])
      const callable = callableCapabilities.get(node.propertyName?.text ?? node.name.text)
      if (callable) record(callable.member, callable.origin, node.name, [...callable.chain, step(`export callable ${node.name.text}`, node.name)])
      recordSurfaceExposure(node.propertyName?.text ?? node.name.text, node.name, `export surface ${node.name.text}`)
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const source = provenanceOf(node.right)
      if (source && (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left)))
        record(source.member, source.origin, node.left, [...source.chain, step(`assign ${node.left.getText(ast)}`, node.left)])
      const callable = callableCapabilities.get(callablePath(node.right))
      if (callable && (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left)))
        record(callable.member, callable.origin, node.left, [...callable.chain, step(`assign callable ${node.left.getText(ast)}`, node.left)])
      if (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
        recordSurfaceExposure(callablePath(node.right), node.left, `assign surface ${node.left.getText(ast)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  const unsafeInterfaces = new Set()
  let interfacesChanged = true
  while (interfacesChanged) {
    interfacesChanged = false
    for (const [name, declaration] of declaredInterfaces) {
      if (unsafeInterfaces.has(name)) continue
      const ownUnsafe = declaration.members.some((member) =>
        GENERIC_ADAPTER_MEMBERS.has(staticName(member.name)))
      const inheritedUnsafe = (declaration.heritageClauses ?? []).some((clause) =>
        clause.types.some((type) =>
          ts.isIdentifier(type.expression) && unsafeInterfaces.has(type.expression.text)))
      if (ownUnsafe || inheritedUnsafe) {
        unsafeInterfaces.add(name)
        if (inheritedUnsafe) record('query', declaration.name, declaration.name, [step(`inherited ${name}`, declaration.name)])
        interfacesChanged = true
      }
    }
  }
  const unique = new Map()
  for (const finding of findings) {
    const key = `${finding.member}:${finding.origin.pos}:${finding.site.pos}:${finding.provenance.join('>')}`
    if (!unique.has(key)) unique.set(key, finding)
  }
  return [...unique.values()]
}

function p2d20CallNodes(ast) {
  const targetAliases = new Set(['acquire_atomic_order_command_v1'])
  const rpcAliases = new Set(['rpc'])
  let changed = true
  while (changed) {
    changed = false
    function collect(node) {
      if (ts.isImportSpecifier(node)) {
        const source = staticName(node.propertyName ?? node.name)
        if (source === 'acquire_atomic_order_command_v1') {
          const destination = node.name.text
          if (!targetAliases.has(destination)) {
            targetAliases.add(destination); changed = true
          }
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const source = ts.isIdentifier(node.initializer)
          ? node.initializer.text
          : ts.isPropertyAccessExpression(node.initializer)
            ? node.initializer.name.text
            : ts.isElementAccessExpression(node.initializer)
              ? literalModule(node.initializer.argumentExpression)
              : null
        const destination = node.name.text
        if (source && targetAliases.has(source) && !targetAliases.has(destination)) {
          targetAliases.add(destination); changed = true
        }
        if (source && rpcAliases.has(source) && !rpcAliases.has(destination)) {
          rpcAliases.add(destination); changed = true
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          const source = staticName(element.propertyName ?? element.name)
          const destination = staticName(element.name)
          if (source === 'acquire_atomic_order_command_v1' && destination && !targetAliases.has(destination)) {
            targetAliases.add(destination); changed = true
          }
          if (source === 'rpc' && destination && !rpcAliases.has(destination)) {
            rpcAliases.add(destination); changed = true
          }
        }
      }
      ts.forEachChild(node, collect)
    }
    collect(ast)
  }
  const results = []
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const called = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : ts.isElementAccessExpression(node.expression)
            ? literalModule(node.expression.argumentExpression)
            : null
      if (called && targetAliases.has(called)) results.push(node)
      if (
        called && rpcAliases.has(called) &&
        literalModule(node.arguments[0]) === 'acquire_atomic_order_command_v1'
      ) results.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return results
}

function roleTargetNodes(ast) {
  const results = []
  function visit(node) {
    if (
      (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) ||
        ts.isPropertyAssignment(node) || ts.isMethodSignature(node) ||
        ts.isParameter(node) || ts.isBindingElement(node)) &&
      normalizedRoleTarget(staticName(node.propertyName ?? node.name))
    ) results.push(node.name ?? node)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return results
}

function closure(start, graph) {
  const seen = new Set()
  const pending = [...(graph.get(start) ?? [])]
  while (pending.length) {
    const current = pending.pop()
    if (!current || seen.has(current)) continue
    seen.add(current)
    pending.push(...(graph.get(current) ?? []))
  }
  return seen
}

function pathTo(start, target, graph) {
  if (start === target) return [start]
  const queue = [[start]]
  const seen = new Set([start])
  while (queue.length) {
    const currentPath = queue.shift()
    const current = currentPath.at(-1)
    for (const next of [...(graph.get(current) ?? [])].sort()) {
      if (seen.has(next)) continue
      const candidate = [...currentPath, next]
      if (next === target) return candidate
      seen.add(next)
      queue.push(candidate)
    }
  }
  return null
}

export function analyzeVirtualFiles(inputFiles) {
  const files = new Map(
    Object.entries(inputFiles).map(([file, source]) => [normalize(file), source])
  )
  const asts = new Map()
  const imports = new Map()
  const graph = new Map()
  for (const [file, source] of files) {
    const ast = sourceFile(file, source)
    const found = importsOf(ast)
    asts.set(file, ast)
    imports.set(file, found)
    graph.set(
      file,
      found
        .map(({ specifier }) => resolveImport(file, specifier, files))
        .filter(Boolean)
    )
  }
  const violations = []
  const add = (file, rule, description, node = asts.get(file)) => {
    const { line, column } = location(asts.get(file), node)
    violations.push({ file, line, column, rule, description })
  }
  const environmentByFile = new Map(
    [...asts].map(([file, ast]) => [file, environmentFindings(ast)])
  )
  const adapterCandidates = [...files.keys()].filter(isAdapter).sort()
  const adapterRoots = new Set([...files.keys()].filter(isAdapterProductionBarrel))
  for (const candidate of adapterCandidates) {
    if ([...adapterRoots].some((rootFile) => closure(rootFile, graph).has(candidate))) continue
    const incoming = adapterCandidates.filter(
      (other) => other !== candidate && closure(other, graph).has(candidate)
    )
    if (incoming.length === 0) {
      adapterRoots.add(candidate)
      continue
    }
    const mutual = incoming.filter((other) => closure(candidate, graph).has(other))
    const externalIncoming = incoming.filter((other) => !mutual.includes(other))
    if (externalIncoming.length === 0 && candidate === [candidate, ...mutual].sort()[0])
      adapterRoots.add(candidate)
  }

  for (const [file, ast] of asts) {
    const reachable = closure(file, graph)
    const client = hasUseClientDirective(ast)
    const browserRoot = client || file.startsWith('hooks/')
    const directSpecs = imports.get(file)
    const unresolvedCore = directSpecs.some(({ specifier }) =>
      /(?:^@\/|\/|^)lib\/core-v2(?:\/|$)|(?:^|\/)core-v2(?:\/|$)/.test(specifier)
    )

    if (
      browserRoot &&
      (unresolvedCore || [...reachable].some(isCoreV2))
    )
      add(file, 'client_to_core_v2', 'Browser-reachable module reaches server-only Core V2.')
    if (browserRoot && [...reachable].some(isServiceModule))
      add(file, 'browser_to_service_role', 'Browser-reachable module reaches a service-role module.')
    if ((browserRoot || isUi(file)) && [...reachable].some(isTrustedRuntime))
      add(file, 'ui_to_trusted_runtime', 'UI module reaches acquisition, executor, Runtime, or replay code.')
    if (browserRoot && [...reachable].some(isInternalCoreV2))
      add(file, 'client_to_core_v2_internal', 'Browser-reachable module reaches internal Core V2 declarations.')
    if (browserRoot) {
      const environmentSources = [file, ...reachable]
        .filter((entry) => (environmentByFile.get(entry) ?? []).length > 0)
        .sort()
      for (const source of environmentSources) {
        const chain = pathTo(file, source, graph)
        if (!chain) continue
        const firstHop =
          chain.length > 1
            ? imports
                .get(file)
                .find(
                  ({ specifier }) =>
                    resolveImport(file, specifier, files) === chain[1]
                )?.node
            : undefined
        for (const finding of environmentByFile.get(source)) {
          const sourceLocation = location(asts.get(source), finding.node)
          add(
            file,
            finding.computed
              ? 'browser_unresolved_environment_access'
              : 'browser_sensitive_environment_reachability',
            finding.computed
              ? `Browser-reachable chain ${chain.join(' -> ')} contains unresolved computed process.env access at ${source}:${sourceLocation.line}:${sourceLocation.column}.`
              : `Browser-reachable chain ${chain.join(' -> ')} reads ${finding.name} at ${source}:${sourceLocation.line}:${sourceLocation.column}.`,
            firstHop ?? finding.node
          )
        }
      }
    }
    if (isRoute(file) && (unresolvedCore || [...reachable].some(isCoreV2)))
      add(file, 'route_core_v2_activation', 'A1 forbids route reachability into Core V2.')
    if (
      isRoute(file) &&
      [...reachable].some((entry) => /supabase\/(?:client|browser)/.test(entry))
    )
      add(file, 'api_to_browser_supabase_client', 'API route reaches a browser Supabase client.')
    if (
      isRoute(file) &&
      (unresolvedCore || [...reachable].some(isCoreV2)) &&
      /create_invoice_with_items_safe|legacy/i.test(files.get(file))
    )
      add(file, 'core_v2_legacy_fallback', 'Core V2 route contains a legacy-write fallback.')

    for (const finding of environmentByFile.get(file)) {
      if (file.startsWith('lib/core-v2/'))
        add(file, 'core_v2_environment_access', `Core V2 reads ${finding.name}.`, finding.node)
    }
    for (const finding of ledgerFindings(ast))
      if (!file.startsWith('scripts/'))
        add(file, 'application_core_v2_ledger_access', `Application references Core V2 relation ${finding.relation}.`, finding.node)

    if (file.startsWith('lib/core-v2/contracts/') || file.startsWith('lib/core-v2/validation/')) {
      for (const { specifier, node } of directSpecs) {
        if (/^(?:react|next\/|@supabase\/)|(?:^|\/)(?:app|components|hooks)\//.test(specifier))
          add(file, 'contract_forbidden_import', `Contract/validation imports ${specifier}.`, node)
      }
      function forbiddenCall(node) {
        if (
          ts.isCallExpression(node) &&
          ((ts.isIdentifier(node.expression) && ['fetch', 'createClient'].includes(node.expression.text)) ||
            (ts.isPropertyAccessExpression(node.expression) && ['rpc', 'from'].includes(node.expression.name.text)))
        )
          add(file, 'contract_forbidden_runtime_access', 'Contract/validation contains network or database access.', node)
        ts.forEachChild(node, forbiddenCall)
      }
      forbiddenCall(ast)
    }

    const adapterRoot = adapterRoots.has(file)
    if (adapterRoot) {
      for (const source of [file, ...reachable].sort()) {
        for (const { specifier, node } of imports.get(source) ?? []) {
          if (!FORBIDDEN_ADAPTER_PACKAGES.test(specifier)) continue
          const chain = source === file ? [file] : pathTo(file, source, graph)
          const sourceLocation = location(asts.get(source), node)
          const importKind = imports.get(source).find((entry) => entry.node === node)?.kind
          add(file, 'adapter_forbidden_package_import',
            `Adapter root ${file}; import chain ${chain.join(' -> ')}; forbidden package ${specifier}; source ${source}:${sourceLocation.line}:${sourceLocation.column}; import kind ${importKind}.`,
            source === file ? node : imports.get(file).find(({ specifier: rootSpecifier }) =>
              resolveImport(file, rootSpecifier, files) === chain[1])?.node)
        }
        for (const environmentNode of allEnvironmentAccesses(asts.get(source))) {
          const chain = source === file ? [file] : pathTo(file, source, graph)
          const sourceLocation = location(asts.get(source), environmentNode)
          add(file, 'adapter_environment_access',
            `Adapter import chain ${chain.join(' -> ')} reaches environment access at ${source}:${sourceLocation.line}:${sourceLocation.column}.`,
            source === file ? environmentNode : imports.get(file).find(({ specifier }) =>
              resolveImport(file, specifier, files) === chain[1])?.node)
        }
        for (const callNode of p2d20CallNodes(asts.get(source))) {
          const chain = source === file ? [file] : pathTo(file, source, graph)
          const sourceLocation = location(asts.get(source), callNode)
          add(file, 'adapter_direct_p2d20_call',
            `Adapter import chain ${chain.join(' -> ')} reaches P2D.20 invocation at ${source}:${sourceLocation.line}:${sourceLocation.column}.`,
            source === file ? callNode : imports.get(file).find(({ specifier }) =>
              resolveImport(file, specifier, files) === chain[1])?.node)
        }
        for (const surface of genericSurfaceFindings(asts.get(source))) {
          const surfaceNode = surface.site
          const chain = source === file ? [file] : pathTo(file, source, graph)
          const sourceLocation = location(asts.get(source), surfaceNode)
          const originLocation = location(asts.get(source), surface.origin)
          add(file, 'adapter_generic_query_surface',
            `Adapter import chain ${chain.join(' -> ')} reaches forbidden member ${surface.member}; origin ${source}:${originLocation.line}:${originLocation.column}; provenance ${surface.provenance.join(' -> ')}; exposed/used at ${source}:${sourceLocation.line}:${sourceLocation.column}.`,
             source === file ? surfaceNode : imports.get(file).find(({ specifier }) =>
               resolveImport(file, specifier, files) === chain[1])?.node)
        }
        for (const policy of adapterPolicyFindings(asts.get(source))) {
          const chain = source === file ? [file] : pathTo(file, source, graph)
          const sourceLocation = location(asts.get(source), policy.node)
          add(file, 'adapter_dynamic_surface_construct',
            `Adapter import chain ${chain.join(' -> ')} reaches policy-prohibited ${policy.label} at ${source}:${sourceLocation.line}:${sourceLocation.column}.`,
            source === file ? policy.node : imports.get(file).find(({ specifier }) =>
              resolveImport(file, specifier, files) === chain[1])?.node)
        }
        for (const roleNode of roleTargetNodes(asts.get(source))) {
          const chain = source === file ? [file] : pathTo(file, source, graph)
          const sourceLocation = location(asts.get(source), roleNode)
          add(file, 'adapter_caller_role_target',
            `Adapter import chain ${chain.join(' -> ')} reaches caller role target at ${source}:${sourceLocation.line}:${sourceLocation.column}.`,
            source === file ? roleNode : imports.get(file).find(({ specifier }) =>
              resolveImport(file, specifier, files) === chain[1])?.node)
        }
      }
    }
  }

  for (const file of [...files.keys()].sort()) {
    if (file === TEST_FAKE || APPROVED_FAKE_IMPORTERS.has(file)) continue
    const reachable = closure(file, graph)
    if (!reachable.has(TEST_FAKE)) continue
    const chain = pathTo(file, TEST_FAKE, graph)
    const firstHop = imports.get(file).find(({ specifier }) =>
      resolveImport(file, specifier, files) === chain[1])?.node
    add(file, 'adapter_test_fake_production_export',
      `Disallowed importer chain ${chain.join(' -> ')} reaches the test fake.`, firstHop)
  }
  const deduplicated = new Map()
  for (const violation of violations) {
    const key = `${violation.rule}|${violation.file}|${violation.line}|${violation.column}|${violation.description}`
    if (!deduplicated.has(key)) deduplicated.set(key, violation)
  }
  return [...deduplicated.values()].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.column - b.column ||
      a.rule.localeCompare(b.rule)
  )
}

export function analyzeSource(file, source) {
  return analyzeVirtualFiles({ [file]: source })
}

export function scanRepository() {
  const files = [...new Set(SCAN_ROOTS.flatMap(walk))].sort()
  return analyzeVirtualFiles(
    Object.fromEntries(
      files.map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')])
    )
  )
}

export const scannerExitCode = (violations) =>
  violations.length > 0 ? 1 : 0

export const formatViolation = (item) =>
  `${item.file}:${item.line}:${item.column}: ${item.rule}: ${item.description}`

function main() {
  const violations = scanRepository()
  if (violations.length) {
    for (const item of violations)
      console.error(formatViolation(item))
  } else console.log('Core V2 forbidden-boundary checks passed.')
  process.exitCode = scannerExitCode(violations)
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main()
