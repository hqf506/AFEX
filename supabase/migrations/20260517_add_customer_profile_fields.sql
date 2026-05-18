alter table public.customers
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists district text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists customer_code text,
  add column if not exists tax_number text,
  add column if not exists notes text;
