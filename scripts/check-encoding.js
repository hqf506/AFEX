async function main() {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const rootDir = process.cwd()
  const scanDirs = ['app', 'components', 'lib', 'scripts']
  const extensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
  const blockedPatterns = [
    {
      label: 'Latin-1 mojibake sequence',
      regex: new RegExp('[\\u00D8\\u00D9]'),
    },
    {
      label: 'Unicode replacement character',
      regex: /\uFFFD/,
    },
  ]

  function walk(dir, foundFiles) {
    if (!fs.existsSync(dir)) return

    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        walk(fullPath, foundFiles)
        continue
      }

      if (extensions.has(path.extname(entry.name))) {
        foundFiles.push(fullPath)
      }
    }
  }

  const files = []

  for (const dir of scanDirs) {
    walk(path.join(rootDir, dir), files)
  }

  const issues = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    const lines = content.split(/\r?\n/)

    lines.forEach((line, index) => {
      for (const pattern of blockedPatterns) {
        if (pattern.regex.test(line)) {
          issues.push({
            file: path.relative(rootDir, file),
            lineNumber: index + 1,
            label: pattern.label,
            line: line.trim(),
          })
          break
        }
      }
    })
  }

  if (issues.length > 0) {
    console.error('Found possible encoding issues:')

    for (const issue of issues) {
      console.error(
        `- ${issue.file}:${issue.lineNumber} [${issue.label}] ${issue.line}`
      )
    }

    process.exit(1)
  }

  console.log('No encoding issues found.')
}

main().catch((error) => {
  console.error('Encoding check failed.')
  console.error(error)
  process.exit(1)
})
