begin;

alter table public.pos_profiles
alter column role set not null;

alter table public.pos_profiles
alter column branch_id set not null;

commit;
