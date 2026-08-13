param(
  [ValidateSet(
    'NONE',
    'BEFORE_FIRST_SET_ROLE',
    'AFTER_PRIVATE_SCHEMA',
    'AFTER_FIRST_OWNER_SENSITIVE_ALTER',
    'MID_POLICIES',
    'BEFORE_POST_ASSERTIONS',
    'DURING_CLEANUP'
  )]
  [string]$FailureStage = 'NONE',

  [string]$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$expectedMigrationSha256 = '096733d7807e08a41b26e37fc50f891675d86aeb20c14c6576e88e8d02e15f9b'
$migrationPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\supabase\migrations\20260813150000_core_v2_atomic_order_execution.sql'))

function Assert-ExactReplacement {
  param(
    [Parameter(Mandatory)][string]$Text,
    [Parameter(Mandatory)][string]$Old,
    [Parameter(Mandatory)][string]$New,
    [Parameter(Mandatory)][string]$Identity
  )

  $first = $Text.IndexOf($Old, [StringComparison]::Ordinal)
  if ($first -lt 0) {
    throw "Protocol source marker not found: $Identity"
  }
  if ($Text.IndexOf($Old, $first + $Old.Length, [StringComparison]::Ordinal) -ge 0) {
    throw "Protocol source marker is not unique: $Identity"
  }
  return $Text.Replace($Old, $New)
}

function New-FailureSql {
  param([Parameter(Mandatory)][string]$Stage)
  return "do `$p2d22_injected_failure`$ begin raise exception 'P2D22_INJECTED_FAILURE_$Stage'; end `$p2d22_injected_failure`$;"
}

if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
  throw "psql executable not found: $PsqlPath"
}
if (-not (Test-Path -LiteralPath $migrationPath -PathType Leaf)) {
  throw "Core migration not found: $migrationPath"
}

$actualMigrationSha256 = (Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualMigrationSha256 -ne $expectedMigrationSha256) {
  throw "Core migration SHA-256 mismatch: $actualMigrationSha256"
}

$requiredEnvironment = @('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE')
foreach ($name in $requiredEnvironment) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
    throw "Required process environment variable is absent: $name"
  }
}

$identity = & $PsqlPath -X -v ON_ERROR_STOP=1 -Atqc "select current_database() || '|' || current_setting('server_version_num') || '|' || session_user;"
if ($LASTEXITCODE -ne 0) {
  throw 'Production/clone identity query failed.'
}
$identityParts = ($identity | Select-Object -Last 1).Trim().Split('|')
if ($identityParts.Count -ne 3 -or $identityParts[0] -ne 'postgres' -or -not $identityParts[1].StartsWith('17')) {
  throw "Database identity mismatch: database=$($identityParts[0]) serverVersionNum=$($identityParts[1])"
}

$source = [IO.File]::ReadAllText($migrationPath, [Text.UTF8Encoding]::new($false))
if ($source.Contains("`r")) {
  throw 'Core migration is not LF-only.'
}

$originalOpening = @'
CREATE SCHEMA afex_core_private AUTHORIZATION afex_function_owner;
REVOKE ALL ON SCHEMA afex_core_private FROM PUBLIC,anon,authenticated,service_role,afex_core_runtime;
GRANT USAGE ON SCHEMA afex_core_private TO afex_function_owner;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT ON public.atomic_order_commands,public.atomic_authorization_contexts,public.atomic_order_command_payloads,public.profiles,public.branches,public.customers,public.catalog_items,public.inventory_stock,public.inventory_movements,public.orders,public.invoices,public.invoice_items TO afex_function_owner;
GRANT UPDATE ON public.atomic_authorization_contexts,public.atomic_order_commands,public.profiles,public.catalog_items,public.inventory_stock TO afex_function_owner;
GRANT INSERT ON public.atomic_authorization_contexts,public.atomic_order_commands,public.atomic_order_command_payloads TO afex_function_owner;
GRANT INSERT ON public.orders,public.invoices,public.invoice_items TO afex_function_owner;
DO $business_policies$ DECLARE z record;BEGIN FOR z IN SELECT * FROM(VALUES('atomic_authorization_contexts','INSERT'),('atomic_authorization_contexts','UPDATE'),('atomic_order_commands','INSERT'),('atomic_order_commands','UPDATE'),('atomic_order_command_payloads','INSERT'),('customers','SELECT'),('catalog_items','SELECT'),('catalog_items','UPDATE'),('inventory_stock','SELECT'),('inventory_stock','UPDATE'),('inventory_movements','SELECT'),('profiles','SELECT'),('profiles','UPDATE'),('branches','SELECT'),('orders','SELECT'),('orders','INSERT'),('invoices','SELECT'),('invoices','INSERT'),('invoice_items','SELECT'),('invoice_items','INSERT'))v(rel,cmd) LOOP IF(SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||z.rel))THEN EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO afex_function_owner %s','p2d22_function_owner_'||z.rel||'_'||lower(z.cmd),z.rel,z.cmd,CASE WHEN z.cmd='INSERT'THEN'WITH CHECK(true)'ELSE'USING(true)'END);END IF;END LOOP;END $business_policies$;
SET LOCAL ROLE afex_function_owner;
'@

$portableOpening = @'
SET LOCAL ROLE postgres;
GRANT afex_function_owner TO postgres WITH SET TRUE, INHERIT FALSE GRANTED BY postgres;
GRANT afex_core_owner TO postgres WITH SET TRUE, INHERIT FALSE GRANTED BY postgres;
GRANT CREATE ON DATABASE postgres TO afex_function_owner;
GRANT USAGE ON SCHEMA public TO afex_core_owner;

SET LOCAL ROLE afex_function_owner;
CREATE SCHEMA afex_core_private AUTHORIZATION afex_function_owner;
REVOKE ALL ON SCHEMA afex_core_private FROM PUBLIC,anon,authenticated,service_role,afex_core_runtime;
GRANT USAGE ON SCHEMA afex_core_private TO afex_function_owner;

SET LOCAL ROLE postgres;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT ON public.profiles,public.branches,public.customers,public.catalog_items,public.inventory_stock,public.inventory_movements,public.orders,public.invoices,public.invoice_items TO afex_function_owner;
GRANT UPDATE ON public.profiles,public.catalog_items,public.inventory_stock TO afex_function_owner;
GRANT INSERT ON public.orders,public.invoices,public.invoice_items TO afex_function_owner;
DO $application_policies$ DECLARE z record;BEGIN FOR z IN SELECT * FROM(VALUES('customers','SELECT'),('catalog_items','SELECT'),('catalog_items','UPDATE'),('inventory_stock','SELECT'),('inventory_stock','UPDATE'),('inventory_movements','SELECT'),('profiles','SELECT'),('profiles','UPDATE'),('branches','SELECT'),('orders','SELECT'),('orders','INSERT'),('invoices','SELECT'),('invoices','INSERT'),('invoice_items','SELECT'),('invoice_items','INSERT'))v(rel,cmd) LOOP IF(SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||z.rel))THEN EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO afex_function_owner %s','p2d22_function_owner_'||z.rel||'_'||lower(z.cmd),z.rel,z.cmd,CASE WHEN z.cmd='INSERT'THEN'WITH CHECK(true)'ELSE'USING(true)'END);END IF;END LOOP;END $application_policies$;

SET LOCAL ROLE afex_core_owner;
GRANT SELECT ON public.atomic_order_commands,public.atomic_authorization_contexts,public.atomic_order_command_payloads TO afex_function_owner;
GRANT UPDATE ON public.atomic_authorization_contexts,public.atomic_order_commands TO afex_function_owner;
GRANT INSERT ON public.atomic_authorization_contexts,public.atomic_order_commands,public.atomic_order_command_payloads TO afex_function_owner;
DO $baseline_policies$ DECLARE z record;BEGIN FOR z IN SELECT * FROM(VALUES('atomic_authorization_contexts','INSERT'),('atomic_authorization_contexts','UPDATE'),('atomic_order_commands','INSERT'),('atomic_order_commands','UPDATE'),('atomic_order_command_payloads','INSERT'))v(rel,cmd) LOOP IF(SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||z.rel))THEN EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO afex_function_owner %s','p2d22_function_owner_'||z.rel||'_'||lower(z.cmd),z.rel,z.cmd,CASE WHEN z.cmd='INSERT'THEN'WITH CHECK(true)'ELSE'USING(true)'END);END IF;END LOOP;END $baseline_policies$;

SET LOCAL ROLE afex_function_owner;
'@

$source = Assert-ExactReplacement -Text $source -Old $originalOpening -New $portableOpening -Identity 'owner-partitioned opening'

$source = Assert-ExactReplacement -Text $source -Old @'
REVOKE ALL ON FUNCTION afex_core_private.acquire_atomic_order_command_internal_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role,afex_core_runtime;
RESET ROLE;



CREATE OR REPLACE FUNCTION public.acquire_atomic_order_command_v1(
'@ -New @'
REVOKE ALL ON FUNCTION afex_core_private.acquire_atomic_order_command_internal_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role,afex_core_runtime;
SET LOCAL ROLE afex_function_owner;



CREATE OR REPLACE FUNCTION public.acquire_atomic_order_command_v1(
'@ -Identity 'acquisition function owner retention'

$source = Assert-ExactReplacement -Text $source -Old @'
RESET ROLE;

DO $roles$
'@ -New @'
SET LOCAL ROLE postgres;

DO $roles$
'@ -Identity 'reconciliation role bootstrap'

$source = Assert-ExactReplacement -Text $source -Old @'
END $roles$;
GRANT USAGE ON SCHEMA afex_core_private TO afex_function_owner;
SET LOCAL ROLE afex_function_owner;
'@ -New @'
END $roles$;
SET LOCAL ROLE afex_function_owner;
GRANT USAGE ON SCHEMA afex_core_private TO afex_function_owner;
'@ -Identity 'reconciliation function owner transition'

$source = Assert-ExactReplacement -Text $source -Old @'
GRANT USAGE,CREATE ON SCHEMA public TO afex_core_owner;
GRANT REFERENCES ON public.atomic_order_commands,public.orders,public.invoices,public.invoice_items,public.catalog_items,public.inventory_movements TO afex_core_owner;
SET LOCAL ROLE afex_core_owner;
'@ -New @'
SET LOCAL ROLE postgres;
GRANT USAGE,CREATE ON SCHEMA public TO afex_core_owner;
GRANT REFERENCES ON public.orders,public.invoices,public.invoice_items,public.catalog_items,public.inventory_movements TO afex_core_owner;
SET LOCAL ROLE afex_core_owner;
'@ -Identity 'new relation owner transition'

$source = Assert-ExactReplacement -Text $source -Old @'
ALTER TABLE public.atomic_order_diagnostics ENABLE ROW LEVEL SECURITY; ALTER TABLE public.atomic_order_diagnostics FORCE ROW LEVEL SECURITY;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM afex_core_owner;
'@ -New @'
ALTER TABLE public.atomic_order_diagnostics ENABLE ROW LEVEL SECURITY; ALTER TABLE public.atomic_order_diagnostics FORCE ROW LEVEL SECURITY;
SET LOCAL ROLE postgres;
REVOKE CREATE ON SCHEMA public FROM afex_core_owner;
SET LOCAL ROLE afex_core_owner;
'@ -Identity 'new relation policy owner retention'

$source = Assert-ExactReplacement -Text $source -Old @'
GRANT SELECT,INSERT ON public.atomic_order_business_links,public.atomic_order_line_links,public.atomic_order_audit,public.atomic_order_diagnostics TO afex_function_owner;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO afex_function_owner;
CREATE POLICY claims_owner ON public.atomic_order_claims FOR ALL TO afex_function_owner USING(true) WITH CHECK(true);
'@ -New @'
GRANT SELECT,INSERT ON public.atomic_order_business_links,public.atomic_order_line_links,public.atomic_order_audit,public.atomic_order_diagnostics TO afex_function_owner;
SET LOCAL ROLE postgres;
GRANT USAGE,SELECT ON SEQUENCE public.order_number_seq,public.invoice_number_seq TO afex_function_owner;
SET LOCAL ROLE afex_core_owner;
CREATE POLICY claims_owner ON public.atomic_order_claims FOR ALL TO afex_function_owner USING(true) WITH CHECK(true);
'@ -Identity 'application sequence owner partition'

$source = Assert-ExactReplacement -Text $source -Old @'
END$$;
RESET ROLE;

DO $acl$
'@ -New @'
END$$;
SET LOCAL ROLE afex_function_owner;

DO $acl$
'@ -Identity 'final function ACL owner retention'

$postInstallMarker = "DO `$post_install`$"
if ($source.IndexOf($postInstallMarker, [StringComparison]::Ordinal) -lt 0) {
  throw 'Post-install marker not found.'
}

$cleanup = @'

SET LOCAL ROLE postgres;
REVOKE CREATE ON DATABASE postgres FROM afex_function_owner;
REVOKE afex_function_owner FROM postgres GRANTED BY postgres;
REVOKE afex_core_owner FROM postgres GRANTED BY postgres;
DO $membership_cleanup$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles granted_role ON granted_role.oid=m.roleid
    JOIN pg_roles member_role ON member_role.oid=m.member
    JOIN pg_roles grantor_role ON grantor_role.oid=m.grantor
    WHERE granted_role.rolname IN ('afex_function_owner','afex_core_owner')
      AND member_role.rolname='postgres'
      AND grantor_role.rolname='postgres'
  ) THEN
    RAISE EXCEPTION 'P2D22_TEMPORARY_MEMBERSHIP_REMAINS';
  END IF;
END $membership_cleanup$;
COMMIT;
'@

if ($FailureStage -eq 'BEFORE_FIRST_SET_ROLE') {
  $source = $source.Replace("SET LOCAL lock_timeout='5s';", "SET LOCAL lock_timeout='5s';`n$(New-FailureSql $FailureStage)")
}
if ($FailureStage -eq 'AFTER_PRIVATE_SCHEMA') {
  $needle = 'GRANT USAGE ON SCHEMA afex_core_private TO afex_function_owner;'
  $index = $source.IndexOf($needle, [StringComparison]::Ordinal)
  if ($index -lt 0) { throw 'Private-schema failure-injection marker not found.' }
  $source = $source.Insert($index + $needle.Length, "`n$(New-FailureSql $FailureStage)")
}
if ($FailureStage -eq 'AFTER_FIRST_OWNER_SENSITIVE_ALTER') {
  $source = $source.Replace('GRANT USAGE ON SCHEMA public TO service_role;', "GRANT USAGE ON SCHEMA public TO service_role;`n$(New-FailureSql $FailureStage)")
}
if ($FailureStage -eq 'MID_POLICIES') {
  $source = $source.Replace('END $application_policies$;', "END `$application_policies`$;`n$(New-FailureSql $FailureStage)")
}
if ($FailureStage -eq 'BEFORE_POST_ASSERTIONS') {
  $source = $source.Replace($postInstallMarker, "$(New-FailureSql $FailureStage)`n$postInstallMarker")
}
if ($FailureStage -eq 'DURING_CLEANUP') {
  $cleanup = $cleanup.Replace('REVOKE afex_core_owner FROM postgres GRANTED BY postgres;', "$(New-FailureSql $FailureStage)`nREVOKE afex_core_owner FROM postgres GRANTED BY postgres;")
}

$source = $source.TrimEnd("`n") + $cleanup
$temporaryPath = Join-Path ([IO.Path]::GetTempPath()) ("p2d22-n03b-protocol-{0}.sql" -f [guid]::NewGuid().ToString('N'))

try {
  [IO.File]::WriteAllText($temporaryPath, $source, [Text.UTF8Encoding]::new($false))
  $savedErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $executionOutput = @(& $PsqlPath -X -v ON_ERROR_STOP=1 -f $temporaryPath 2>&1)
    $executionExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $savedErrorActionPreference
  }
} finally {
  if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force
  }
}

if ($FailureStage -eq 'NONE' -and $executionExitCode -ne 0) {
  $executionOutput | Write-Output
  throw "Installation protocol failed with exit code $executionExitCode."
}
if ($FailureStage -ne 'NONE' -and $executionExitCode -eq 0) {
  throw "Failure injection did not fail closed: $FailureStage"
}
if ($FailureStage -ne 'NONE' -and (($executionOutput | Out-String) -notmatch [regex]::Escape("P2D22_INJECTED_FAILURE_$FailureStage"))) {
  $executionOutput | Write-Output
  throw "Failure injection was preempted by an unrelated error: $FailureStage"
}

[pscustomobject]@{
  protocolVersion = 'p2d22-n03b-supabase-installation-v1'
  migrationSHA256 = $actualMigrationSha256
  database = $identityParts[0]
  serverVersionNum = $identityParts[1]
  sessionUser = $identityParts[2]
  failureStage = $FailureStage
  expectedOutcomeObserved = $true
}
