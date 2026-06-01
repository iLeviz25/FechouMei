drop policy if exists "Users can delete their own reminder preferences" on public.reminder_preferences;
create policy "Users can delete their own reminder preferences"
on public.reminder_preferences
for delete
to authenticated
using (auth.uid() = user_id);
