alter table public.system_settings
add column if not exists whatsapp_order_ready_message_template text,
add column if not exists whatsapp_order_delivered_message_template text;
