create table if not exists public.whatsapp_assistant_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_number text,
  remote_jid text,
  status text not null default 'pending' check (status in ('pending', 'linked', 'expired', 'revoked')),
  activation_code text,
  activation_expires_at timestamptz,
  linked_at timestamptz,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create unique index if not exists whatsapp_assistant_links_activation_code_idx
on public.whatsapp_assistant_links (activation_code)
where activation_code is not null;

create unique index if not exists whatsapp_assistant_links_linked_phone_idx
on public.whatsapp_assistant_links (phone_number)
where status = 'linked' and phone_number is not null;

create index if not exists whatsapp_assistant_links_user_status_idx
on public.whatsapp_assistant_links (user_id, status);

alter table public.whatsapp_assistant_links enable row level security;

drop policy if exists "Users can view their own WhatsApp assistant link" on public.whatsapp_assistant_links;
create policy "Users can view their own WhatsApp assistant link"
on public.whatsapp_assistant_links
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own WhatsApp assistant link" on public.whatsapp_assistant_links;
create policy "Users can insert their own WhatsApp assistant link"
on public.whatsapp_assistant_links
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own WhatsApp assistant link" on public.whatsapp_assistant_links;
create policy "Users can update their own WhatsApp assistant link"
on public.whatsapp_assistant_links
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists set_whatsapp_assistant_links_updated_at on public.whatsapp_assistant_links;
create trigger set_whatsapp_assistant_links_updated_at
before update on public.whatsapp_assistant_links
for each row
execute function public.set_updated_at();
