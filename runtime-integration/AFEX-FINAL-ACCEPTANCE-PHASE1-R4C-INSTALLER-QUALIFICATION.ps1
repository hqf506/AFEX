param(
  [string]$PostgresImage = 'postgres:17.6'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$migrationPath = Join-Path $repoRoot 'supabase\migrations\20260814233000_pos_actor_sessions.sql'
$setupPath = Join-Path $PSScriptRoot 'AFEX-FINAL-ACCEPTANCE-PHASE1-R2-CLONE-SETUP.sql'
$expectedRejectedHash = '9207966b13e0775ebe9122308b1af87d259e675407f553c4e341effc05949b74'
$bootstrapPassword = [guid]::NewGuid().ToString('N')
$transitionPassword = [guid]::NewGuid().ToString('N')
$installerPassword = [guid]::NewGuid().ToString('N')
$temporaryPassword = [guid]::NewGuid().ToString('N')

if (-not (Test-Path -LiteralPath $migrationPath -PathType Leaf)) { throw 'R4C migration missing.' }
if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) { throw 'Clone setup missing.' }
$currentHash = (Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($currentHash -eq $expectedRejectedHash) { throw 'Rejected R4B hash is still present.' }

function Invoke-ContainerPsql {
  param(
    [Parameter(Mandatory)][string]$Container,
    [Parameter(Mandatory)][string]$Role,
    [Parameter(Mandatory)][string]$Password,
    [string]$Sql,
    [string]$File
  )
  $args = @('exec','-e',"PGPASSWORD=$Password",$Container,'psql','-h','127.0.0.1','-U',$Role,'-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1')
  if ($File) { $args += @('-f',$File) } else { $args += @('-c',$Sql) }
  $saved = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = @(& docker @args 2>&1); $exitCode = $LASTEXITCODE }
  finally { $ErrorActionPreference = $saved }
  [pscustomobject]@{ ExitCode=$exitCode; Output=($output -join "`n") }
}

function New-R5BContainer {
  param([Parameter(Mandatory)][string]$Name)
  & docker run --name $Name -e "POSTGRES_PASSWORD=$bootstrapPassword" -d $PostgresImage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Container start failed: $Name" }
  for ($i=0; $i -lt 30; $i++) {
    & docker exec $Name pg_isready -U postgres 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  $bootstrap = Invoke-ContainerPsql -Container $Name -Role postgres -Password $bootstrapPassword -Sql "create role transition_admin login password '$transitionPassword' superuser;"
  if ($bootstrap.ExitCode -ne 0) { throw $bootstrap.Output }
  $topology = Invoke-ContainerPsql -Container $Name -Role transition_admin -Password transition-pass -Sql @"
alter role postgres rename to bootstrap_admin;
create role postgres login password '$installerPassword' createrole nosuperuser noinherit;
alter database postgres owner to postgres;
create role r5b_temp_login login password '$temporaryPassword' nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
grant postgres to r5b_temp_login with admin false, inherit false, set true granted by bootstrap_admin;
"@
  if ($topology.ExitCode -ne 0) { throw $topology.Output }
  & docker cp $setupPath "${Name}:/tmp/setup.sql" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Setup copy failed.' }
  $setup = Invoke-ContainerPsql -Container $Name -Role postgres -Password $installerPassword -File '/tmp/setup.sql'
  if ($setup.ExitCode -ne 0) { throw $setup.Output }
}

function Remove-R5BContainer {
  param([Parameter(Mandatory)][string]$Name)
  & docker rm -f $Name 2>$null | Out-Null
}

function Assert-RollbackEmpty {
  param([Parameter(Mandatory)][string]$Container)
  $check = Invoke-ContainerPsql -Container $Container -Role bootstrap_admin -Password $bootstrapPassword -Sql @"
select
 (select count(*) from pg_roles where rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')) || '|' ||
 (select count(*) from pg_namespace where nspname='afex_pos_authority') || '|' ||
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='afex_pos_authority') || '|' ||
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%pos_actor_session%') || '|' ||
 (select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance'));
"@
  if ($check.ExitCode -ne 0 -or $check.Output.Trim() -ne '0|0|0|0|0') {
    throw "Rollback residue in $Container`: $($check.Output)"
  }
}

function Invoke-MigrationCase {
  param(
    [Parameter(Mandatory)][string]$Case,
    [string]$PreSql,
    [string]$ExpectedError,
    [string]$SourceTransform = 'NONE',
    [switch]$ExpectSuccess,
    [switch]$Reinstall
  )
  $name = "afex-r5b-$($Case.ToLowerInvariant().Replace('_','-'))"
  $temporarySql = $null
  try {
    Write-Host "R5B_CASE_START=$Case"
    New-R5BContainer -Name $name
    if ($PreSql) {
      $pre = Invoke-ContainerPsql -Container $name -Role bootstrap_admin -Password $bootstrapPassword -Sql $PreSql
      if ($pre.ExitCode -ne 0) { throw $pre.Output }
    }
    $source = [IO.File]::ReadAllText($migrationPath,[Text.UTF8Encoding]::new($false))
    if ($SourceTransform -eq 'RUNNER_PRESET_POSTGRES') {
      $source = "set role postgres;`n" + $source
    } elseif ($SourceTransform -eq 'RUNNER_PRESET_THIRD_ROLE') {
      $source = "set role transition_admin;`n" + $source
    } elseif ($SourceTransform -ne 'NONE') {
      $markerMap = @{
        'FAIL_PREFLIGHT' = "set local statement_timeout = '30s';"
        'FAIL_POST_SET' = "end as installer_role_activation;"
        'FAIL_ROLE_CREATION' = "end`n`$preflight`$;"
        'FAIL_SCHEMA_CREATION' = 'create schema afex_pos_authority authorization afex_pos_session_owner;'
        'FAIL_FUNCTION_CREATION' = 'create trigger actor_sessions_transition_guard'
        'FAIL_FINAL_GRANTS' = 'do $remove_temporary_owner_edges$'
      }
      $marker = $markerMap[$SourceTransform]
      $index = $source.IndexOf($marker,[StringComparison]::Ordinal)
      if ($index -lt 0) { throw "Failure marker missing: $SourceTransform" }
      $insertAt = if ($SourceTransform -in @('FAIL_PREFLIGHT','FAIL_POST_SET','FAIL_ROLE_CREATION','FAIL_SCHEMA_CREATION')) { $index + $marker.Length } else { $index }
      $failure = "`ndo `$r5b_injected_failure`$ begin raise exception 'R5B_INJECTED_$SourceTransform'; end `$r5b_injected_failure`$;`n"
      $source = $source.Insert($insertAt,$failure)
    }
    $temporarySql = Join-Path ([IO.Path]::GetTempPath()) ("afex-r5b-{0}-{1}.sql" -f $Case,[guid]::NewGuid().ToString('N'))
    [IO.File]::WriteAllText($temporarySql,$source,[Text.UTF8Encoding]::new($false))
    & docker cp $temporarySql "${name}:/tmp/migration.sql" | Out-Null
    $run = Invoke-ContainerPsql -Container $name -Role r5b_temp_login -Password $temporaryPassword -File '/tmp/migration.sql'
    if ($ExpectSuccess) {
      if ($run.ExitCode -ne 0) { throw $run.Output }
      if ($Reinstall) {
        $second = Invoke-ContainerPsql -Container $name -Role r5b_temp_login -Password $temporaryPassword -File '/tmp/migration.sql'
        if ($second.ExitCode -eq 0 -or $second.Output -notmatch 'POS_SESSION_AUTHORITY_ALREADY_PRESENT') {
          throw "Reinstallation did not fail closed: $($second.Output)"
        }
      }
    } else {
      if ($run.ExitCode -eq 0 -or $run.Output -notmatch [regex]::Escape($ExpectedError)) {
        throw "Expected $ExpectedError but observed: $($run.Output)"
      }
      Assert-RollbackEmpty -Container $name
    }
    [pscustomobject]@{ Case=$Case; Result='PASS'; Expected=if($ExpectSuccess){'SUCCESS'}else{$ExpectedError} }
  } finally {
    if ($temporarySql -and (Test-Path -LiteralPath $temporarySql)) { Remove-Item -LiteralPath $temporarySql -Force }
    Remove-R5BContainer -Name $name
  }
}

$results = @()
$results += Invoke-MigrationCase -Case 'MODE_A_DIRECT_ENTRY' -ExpectSuccess
$results += Invoke-MigrationCase -Case 'MODE_B_RUNNER_PRESET' -SourceTransform 'RUNNER_PRESET_POSTGRES' -ExpectSuccess
$results += Invoke-MigrationCase -Case 'MISSING_SET' -PreSql "revoke postgres from r5b_temp_login granted by bootstrap_admin;" -ExpectedError 'POS_SESSION_POSTGRES_SET_AUTHORITY_MISSING'
$results += Invoke-MigrationCase -Case 'SESSION_CREATEROLE' -PreSql 'alter role r5b_temp_login createrole;' -ExpectedError 'POS_SESSION_TEMPORARY_LOGIN_IDENTITY_INVALID'
$results += Invoke-MigrationCase -Case 'POSTGRES_SUPERUSER' -PreSql 'alter role postgres superuser;' -ExpectedError 'POS_SESSION_POSTGRES_INSTALLER_INVALID'
$results += Invoke-MigrationCase -Case 'POSTGRES_NO_CREATEROLE' -PreSql 'alter role postgres nocreaterole;' -ExpectedError 'POS_SESSION_POSTGRES_INSTALLER_INVALID'
$results += Invoke-MigrationCase -Case 'WRONG_CURRENT_ROLE' -PreSql "grant transition_admin to r5b_temp_login with admin false, inherit false, set true granted by bootstrap_admin;" -SourceTransform 'RUNNER_PRESET_THIRD_ROLE' -ExpectedError 'POS_SESSION_RUNNER_EFFECTIVE_ROLE_INVALID'
$results += Invoke-MigrationCase -Case 'CORE_MEMBER_MISMATCH' -PreSql "revoke afex_core_owner from postgres granted by bootstrap_admin;" -ExpectedError 'POS_SESSION_CREATOR_TOPOLOGY_INVALID'
$results += Invoke-MigrationCase -Case 'UNEXPECTED_GRANTOR' -PreSql "grant afex_core_owner to transition_admin with admin true, inherit false, set false granted by bootstrap_admin; set role transition_admin; grant afex_core_owner to postgres with admin false, inherit false, set false granted by transition_admin; reset role;" -ExpectedError 'POS_SESSION_CREATOR_TOPOLOGY_INVALID'
$results += Invoke-MigrationCase -Case 'EXTRA_SET_EDGE' -PreSql "grant afex_core_owner to transition_admin with admin true, inherit false, set false granted by bootstrap_admin; set role transition_admin; grant afex_core_owner to postgres with admin false, inherit false, set true granted by transition_admin; reset role;" -ExpectedError 'POS_SESSION_CREATOR_TOPOLOGY_INVALID'
$results += Invoke-MigrationCase -Case 'FAIL_PREFLIGHT' -SourceTransform 'FAIL_PREFLIGHT' -ExpectedError 'R5B_INJECTED_FAIL_PREFLIGHT'
$results += Invoke-MigrationCase -Case 'FAIL_POST_SET' -SourceTransform 'FAIL_POST_SET' -ExpectedError 'R5B_INJECTED_FAIL_POST_SET'
$results += Invoke-MigrationCase -Case 'FAIL_ROLE_CREATION' -SourceTransform 'FAIL_ROLE_CREATION' -ExpectedError 'R5B_INJECTED_FAIL_ROLE_CREATION'
$results += Invoke-MigrationCase -Case 'FAIL_SCHEMA_CREATION' -SourceTransform 'FAIL_SCHEMA_CREATION' -ExpectedError 'R5B_INJECTED_FAIL_SCHEMA_CREATION'
$results += Invoke-MigrationCase -Case 'FAIL_FUNCTION_CREATION' -SourceTransform 'FAIL_FUNCTION_CREATION' -ExpectedError 'R5B_INJECTED_FAIL_FUNCTION_CREATION'
$results += Invoke-MigrationCase -Case 'FAIL_FINAL_GRANTS' -SourceTransform 'FAIL_FINAL_GRANTS' -ExpectedError 'R5B_INJECTED_FAIL_FINAL_GRANTS'
$results += Invoke-MigrationCase -Case 'REINSTALLATION' -ExpectSuccess -Reinstall

$results | Format-Table -AutoSize
[pscustomobject]@{
  migrationSHA256=$currentHash
  caseCount=$results.Count
  passCount=@($results | Where-Object Result -eq 'PASS').Count
  failedCount=@($results | Where-Object Result -ne 'PASS').Count
} | ConvertTo-Json -Compress
