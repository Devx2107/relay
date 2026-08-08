-- RLS Policies for Relay Application Data
-- FND-005

-- users
create policy "Users can view their own profile"
  on public.users for select
  using ( auth.uid() = id );

create policy "Users can update their own profile"
  on public.users for update
  using ( auth.uid() = id );

-- conversations
create policy "Users can select their own conversations"
  on public.conversations for select
  using ( auth.uid() = user_id );

create policy "Users can insert their own conversations"
  on public.conversations for insert
  with check ( auth.uid() = user_id );

create policy "Users can update their own conversations"
  on public.conversations for update
  using ( auth.uid() = user_id );

create policy "Users can delete their own conversations"
  on public.conversations for delete
  using ( auth.uid() = user_id );

-- messages
create policy "Users can select messages in their conversations"
  on public.messages for select
  using ( conversation_id in (select id from public.conversations where user_id = auth.uid()) );

create policy "Users can insert messages in their conversations"
  on public.messages for insert
  with check ( conversation_id in (select id from public.conversations where user_id = auth.uid()) );

create policy "Users can update messages in their conversations"
  on public.messages for update
  using ( conversation_id in (select id from public.conversations where user_id = auth.uid()) );

create policy "Users can delete messages in their conversations"
  on public.messages for delete
  using ( conversation_id in (select id from public.conversations where user_id = auth.uid()) );

-- triage_items
create policy "Users can select their own triage items"
  on public.triage_items for select
  using ( auth.uid() = user_id );

create policy "Users can insert their own triage items"
  on public.triage_items for insert
  with check ( auth.uid() = user_id );

create policy "Users can update their own triage items"
  on public.triage_items for update
  using ( auth.uid() = user_id );

create policy "Users can delete their own triage items"
  on public.triage_items for delete
  using ( auth.uid() = user_id );

-- agent_runs
create policy "Users can select agent runs in their conversations"
  on public.agent_runs for select
  using ( conversation_id in (select id from public.conversations where user_id = auth.uid()) );

create policy "Users can insert agent runs in their conversations"
  on public.agent_runs for insert
  with check ( conversation_id in (select id from public.conversations where user_id = auth.uid()) );

create policy "Users can update agent runs in their conversations"
  on public.agent_runs for update
  using ( conversation_id in (select id from public.conversations where user_id = auth.uid()) );

create policy "Users can delete agent runs in their conversations"
  on public.agent_runs for delete
  using ( conversation_id in (select id from public.conversations where user_id = auth.uid()) );
