param(
  [string]$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe',
  [string]$MigrationPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $MigrationPath) {
  $MigrationPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\supabase\migrations\20260814170000_core_v2_acquisition_observability.sql'))
}
if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) { throw "psql executable not found: $PsqlPath" }
if (-not (Test-Path -LiteralPath $MigrationPath -PathType Leaf)) { throw "migration not found: $MigrationPath" }

$requiredEnvironment = @('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE')
foreach ($name in $requiredEnvironment) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
    throw "Required process environment variable is absent: $name"
  }
}

$identity = & $PsqlPath -X -v ON_ERROR_STOP=1 -Atqc "select current_database() || '|' || current_setting('server_version_num') || '|' || session_user || '|' || current_user;"
if ($LASTEXITCODE -ne 0) { throw 'Database identity query failed.' }
$identityParts = ($identity | Select-Object -Last 1).Trim().Split('|')
if ($identityParts.Count -ne 4 -or -not $identityParts[1].StartsWith('17') -or $identityParts[2] -ne 'postgres' -or $identityParts[3] -ne 'postgres') {
  throw "Database/installer identity mismatch."
}

$source = [IO.File]::ReadAllText($MigrationPath, [Text.UTF8Encoding]::new($false))
if ($source.Contains("`r")) { throw 'Migration is not LF-only.' }
if ($source -notmatch '(?s)^BEGIN;.*REVOKE afex_function_owner FROM postgres GRANTED BY postgres;.*COMMIT;\s*$') {
  throw 'Migration does not contain the bounded grant/revoke transaction.'
}

& $PsqlPath -X -v ON_ERROR_STOP=1 -f $MigrationPath
if ($LASTEXITCODE -ne 0) { throw "Observability migration failed with exit code $LASTEXITCODE." }

$remainingEdges = & $PsqlPath -X -v ON_ERROR_STOP=1 -Atqc "select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member join pg_roles g on g.oid=m.grantor where r.rolname='afex_function_owner' and u.rolname='postgres' and g.rolname='postgres' and m.set_option;"
if ($LASTEXITCODE -ne 0 -or [int]($remainingEdges | Select-Object -Last 1) -ne 0) {
  throw 'Temporary membership cleanup assertion failed.'
}

[pscustomobject]@{
  protocolVersion = 'p2d22-r3-acquisition-observability-v1'
  migrationSHA256 = (Get-FileHash -LiteralPath $MigrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  serverVersionNum = $identityParts[1]
  temporaryMembershipEdges = 0
  installed = $true
}
