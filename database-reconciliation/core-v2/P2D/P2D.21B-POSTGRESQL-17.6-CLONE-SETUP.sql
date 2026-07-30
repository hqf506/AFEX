-- P2D.21B — PostgreSQL 17.6 disposable compatibility foundation
-- TEST ONLY. Never execute against Production.
\set ON_ERROR_STOP on

SELECT CASE
    WHEN current_setting('server_version_num')::integer = 170006 THEN 1
    ELSE pg_catalog.set_config(
        'p2d21b.invalid_server',
        (1 / 0)::text,
        false
    )::integer
END AS postgres_17_6_required;

SELECT CASE
    WHEN current_setting('server_encoding') = 'UTF8' THEN 1
    ELSE pg_catalog.set_config(
        'p2d21b.invalid_encoding',
        (1 / 0)::text,
        false
    )::integer
END AS utf8_required;

DO $setup$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = CURRENT_USER AND rolsuper
    ) THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'P2D21B requires a disposable local superuser installer';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D21B requires a fresh disposable role namespace';
    END IF;
END
$setup$;

BEGIN;

CREATE ROLE anon
    NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOREPLICATION NOBYPASSRLS PASSWORD NULL;
CREATE ROLE authenticated
    NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOREPLICATION NOBYPASSRLS PASSWORD NULL;
CREATE ROLE service_role
    NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOREPLICATION NOBYPASSRLS PASSWORD NULL;

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY
);

CREATE TABLE public.branches (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    is_active boolean NOT NULL DEFAULT true,
    deleted_at timestamp with time zone
);

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id),
    branch_id uuid REFERENCES public.branches(id),
    role text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    updated_at timestamp with time zone NOT NULL
        DEFAULT transaction_timestamp(),
    CONSTRAINT profiles_test_role_check CHECK (
        role IN ('owner', 'admin', 'manager', 'employee', 'cashier')
    )
);

INSERT INTO public.tenants (id)
VALUES ('10000000-0000-4000-8000-000000000001');

INSERT INTO public.branches (id, tenant_id, is_active)
VALUES (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    true
);

INSERT INTO public.profiles (
    id,
    tenant_id,
    branch_id,
    role,
    is_active
)
VALUES (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'owner',
    true
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenants FROM PUBLIC;
REVOKE ALL ON TABLE public.branches FROM PUBLIC;
REVOKE ALL ON TABLE public.profiles FROM PUBLIC;

COMMIT;

SELECT
    current_setting('server_version') AS server_version,
    current_setting('server_version_num') AS server_version_num,
    current_setting('server_encoding') AS server_encoding,
    current_setting('lc_collate') AS lc_collate,
    current_setting('lc_ctype') AS lc_ctype,
    'P2D21B_100_CLONE_SETUP_OK'::text AS marker;

-- END OF P2D.21B POSTGRESQL 17.6 CLONE SETUP
