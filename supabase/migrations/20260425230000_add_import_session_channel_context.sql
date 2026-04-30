alter table public.import_sessions
add column if not exists channel_remote_id text;

create index if not exists import_sessions_whatsapp_channel_idx
on public.import_sessions (user_id, source, channel_remote_id, created_at desc)
where source = 'whatsapp';
