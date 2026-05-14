alter table public.system_settings
  add column if not exists digital_invoice_brand_name text,
  add column if not exists digital_invoice_branch_name text,
  add column if not exists digital_invoice_address_line_1 text,
  add column if not exists digital_invoice_address_line_2 text,
  add column if not exists digital_invoice_whatsapp_number text,
  add column if not exists digital_invoice_google_review_link text,
  add column if not exists digital_invoice_map_link text,
  add column if not exists digital_invoice_note text;
