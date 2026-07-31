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
      if (specifier) imports.push({ specifier, node: node.moduleSpecifier })
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments.length === 1
    ) {
      const specifier = literalModule(node.arguments[0])
      if (specifier) imports.push({ specifier, node: node.arguments[0] })
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
  }
  return violations.sort(
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
