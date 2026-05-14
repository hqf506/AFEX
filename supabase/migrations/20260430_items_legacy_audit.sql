-- Safe audit migration for legacy public.items
-- This file is intentionally non-destructive.
-- It does not rename or drop anything.
-- Run it first, review the query results, then decide whether a follow-up
-- migration should rename public.items to public.items_legacy_backup.

begin;

-- 1) Does public.items exist?
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relkind as relation_kind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'items';

-- 2) How many rows are currently in public.items?
-- Safe because to_regclass returns null if the table does not exist.
select
  case
    when to_regclass('public.items') is null then null
    else (select count(*)::bigint from public.items)
  end as items_row_count;

-- 3) Which foreign keys point to public.items?
select
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema as referenced_table_schema,
  ccu.table_name as referenced_table_name,
  ccu.column_name as referenced_column_name,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
  and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
  and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and ccu.table_schema = 'public'
  and ccu.table_name = 'items'
order by tc.table_schema, tc.table_name, tc.constraint_name;

-- 4) Which views mention public.items or items?
select
  schemaname,
  viewname,
  definition
from pg_views
where definition ilike '%public.items%'
   or definition ilike '% from items%'
   or definition ilike '% join items%'
order by schemaname, viewname;

-- 5) Which functions / RPCs mention public.items or items?
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where pg_get_functiondef(p.oid) ilike '%public.items%'
   or pg_get_functiondef(p.oid) ilike '% from items%'
   or pg_get_functiondef(p.oid) ilike '% join items%'
order by n.nspname, p.proname;

-- 6) Optional quick metadata snapshot for public.items columns, if it exists.
select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'items'
order by ordinal_position;

commit;

-- Follow-up migration suggestion only, do not execute automatically here:
-- File name suggestion:
--   YYYYMMDD_items_legacy_rename.sql
--
-- Suggested SQL after review confirms public.items is unused:
-- begin;
-- alter table if exists public.items rename to items_legacy_backup;
-- commit;
