begin;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(trim(username)))
  where username is not null
    and trim(username) <> '';

commit;
