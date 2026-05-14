alter table public.catalog_items
add column if not exists pos_display_mode text not null default 'style';

alter table public.catalog_items
add column if not exists pos_color text null;

alter table public.catalog_items
add column if not exists pos_shape text null;
