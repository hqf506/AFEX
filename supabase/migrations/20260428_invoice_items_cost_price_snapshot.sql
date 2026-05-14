alter table public.invoice_items
  add column if not exists cost_price numeric not null default 0;
