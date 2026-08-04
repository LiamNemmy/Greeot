-- 1) Create users in Supabase Auth first (Authentication -> Users).
-- 2) Replace the emails below with real auth user emails.
-- 3) Run this script. It only inserts rows for users that actually exist in auth.users.

with desired_roles(email, role) as (
  values
    ('griot@sb.co', 'editor'),
    ('publisher@example.com', 'publisher')
),
matched_users as (
  select
    u.id as user_id,
    lower(u.email) as email,
    d.role
  from desired_roles d
  join auth.users u
    on lower(u.email) = lower(d.email)
)
insert into public.publisher_profiles (user_id, email, role)
select user_id, email, role
from matched_users
on conflict (user_id) do update
set email = excluded.email,
    role = excluded.role,
    updated_at = now();

-- Optional check: which desired emails were not found in auth.users
-- select d.*
-- from desired_roles d
-- left join auth.users u on lower(u.email) = lower(d.email)
-- where u.id is null;
