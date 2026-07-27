/*
AFEX Core V2 Package 6R fail-closed rollback guard.

DO NOT EXECUTE without external approval. Authoritative prior definitions,
owners, ACLs, policies, memberships, default privileges, activation rows and
control-data before-images, trigger definitions and quote definitions are not
embedded. Automatic reversal is unsafe. An approved forward fix or an
authoritative restoration bundle is required.
*/
do $package6r_rollback_blocked$
begin
  raise exception using
    errcode='55000',
    message='PACKAGE_6R_ROLLBACK_BLOCKED',
    detail='No complete authoritative Package 6 before-state restoration bundle is embedded.',
    hint='STOP. Do not activate or broaden privileges. Keep the kill switch enabled and runtime grants closed; use an externally reviewed forward fix or authoritative restoration.';
end;
$package6r_rollback_blocked$;
