-- =============================================================
--  Pairy B 파트: 홈 · 친구 · 팸 · 낙상/SOS 알림
--  Supabase SQL Editor에 그대로 붙여 넣어 실행하거나 `supabase db push`로 적용합니다.
--  여러 번 실행해도 안전하게 작성했습니다.
--
--  테이블
--    profiles          (A 파트와 공유. 없으면 만들고, B가 쓰는 칼럼만 추가)
--    daily_steps       하루 걸음 수 (홈 · 팸 함께 걸음, 실시간)  + profiles.step_goal 하루 목표
--    friendships       친구 관계
--    fams, fam_members 팸 · 초대 코드 · 멤버
--    safety_settings   낙상 민감도 · 대기 시간 · 알림 설정
--    emergency_alerts  낙상 이벤트 상태 · 위치 · 응답 상태(요약)
--                      ※ 위치는 알림이 진행 중(countdown/sent)일 때만 본인이 올리고, 본인과 알림 받은 사람만 볼 수 있음
--    alert_recipients  알림 받은 사람별 응답 상태 (전달됨/확인했어요/전화 거는 중/가는 중)
--
--  원칙: 상태가 바뀌는 동작(친구 요청, 팸 가입, 낙상 상태 전이)은 RPC 함수로만 하고
--  테이블 직접 INSERT/UPDATE는 막는다. -> 상태 전이 규칙이 DB 한곳에 모임
-- =============================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------
-- 0. profiles (A 파트와 공유)
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null default '페어리',
  created_at  timestamptz not null default now()
);
alter table public.profiles add column if not exists avatar_emoji text not null default '🧚';
alter table public.profiles add column if not exists friend_code text;   -- 친구 번호 (6자리)
alter table public.profiles add column if not exists handle text;        -- @haeun.dsn
alter table public.profiles add column if not exists tags text[] not null default '{}';  -- {디자인,ENFP}
alter table public.profiles add column if not exists step_goal int not null default 5000;  -- 하루 걸음 목표
alter table public.profiles drop constraint if exists profiles_step_goal_check;
alter table public.profiles add constraint profiles_step_goal_check check (step_goal between 1000 and 50000);
create unique index if not exists profiles_friend_code_key on public.profiles(friend_code);

-- (예전 버전에서 만든 전화번호 테이블 정리)
drop table if exists public.profile_private;

-- 헷갈리는 글자(0/O, 1/I/L)를 뺀 대문자+숫자 코드
create or replace function public.gen_code(len int default 6)
returns text language plpgsql volatile as $$
declare
  chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for i in 1..len loop
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return result;
end $$;

create or replace function public.set_friend_code()
returns trigger language plpgsql as $$
begin
  if new.friend_code is null then
    loop
      new.friend_code := public.gen_code(6);
      exit when not exists (select 1 from public.profiles where friend_code = new.friend_code);
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists profiles_set_friend_code on public.profiles;
create trigger profiles_set_friend_code
  before insert on public.profiles
  for each row execute function public.set_friend_code();

update public.profiles set friend_code = public.gen_code(6) where friend_code is null;

-- 회원가입 시 프로필 + 기본 안전 설정 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1), '페어리'))
  on conflict (id) do nothing;
  insert into public.safety_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

alter table public.profiles enable row level security;
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- -------------------------------------------------------------
-- 1. daily_steps
-- -------------------------------------------------------------
create table if not exists public.daily_steps (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default (now() at time zone 'Asia/Seoul')::date,
  steps   int  not null default 0 check (steps >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_steps enable row level security;
drop policy if exists "steps_own" on public.daily_steps;
create policy "steps_own" on public.daily_steps
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.kst_today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

drop trigger if exists steps_touch on public.daily_steps;
-- (touch_updated_at 은 4장에서 만들어지므로 트리거는 4장 뒤에서 연결)

-- 걸음 목표 저장 (1,000 ~ 50,000)
create or replace function public.set_step_goal(p_goal int)
returns int language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_goal is null or p_goal < 1000 or p_goal > 50000 then raise exception 'INVALID_STEP_GOAL'; end if;
  update profiles set step_goal = p_goal where id = auth.uid();
  return p_goal;
end $$;

-- -------------------------------------------------------------
-- 2. friendships
-- -------------------------------------------------------------
create table if not exists public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users(id) on delete cascade,
  addressee_id  uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted')),
  source        text not null default 'code' check (source in ('code', 'search', 'nfc', 'keyring')),
  requester_favorite boolean not null default false,
  addressee_favorite boolean not null default false,
  meet_count    int not null default 0,          -- 키링 맞대기 횟수
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  check (requester_id <> addressee_id)
);
create unique index if not exists friendships_pair_key
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;
drop policy if exists "friendships_read_mine" on public.friendships;
create policy "friendships_read_mine" on public.friendships
  for select to authenticated using (auth.uid() in (requester_id, addressee_id));

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(a, b)
      and greatest(requester_id, addressee_id) = greatest(a, b)
  );
$$;

drop view if exists public.my_friends;
create view public.my_friends with (security_invoker = true) as
select
  f.id                      as friendship_id,
  f.status,
  f.source,
  f.meet_count,
  f.created_at,
  f.accepted_at,
  (f.requester_id = auth.uid()) as is_outgoing,
  case when f.requester_id = auth.uid() then f.requester_favorite else f.addressee_favorite end as is_favorite,
  p.id                      as friend_id,
  p.nickname,
  p.avatar_emoji,
  p.friend_code,
  p.handle,
  p.tags
from public.friendships f
join public.profiles p
  on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
where auth.uid() in (f.requester_id, f.addressee_id);

-- 친구 요청: 친구 번호로. 상대가 이미 나에게 요청했으면 바로 수락
create or replace function public.send_friend_request(p_friend_code text, p_source text default 'code')
returns public.friendships
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target uuid;
  existing friendships;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select id into target from profiles where friend_code = upper(trim(p_friend_code));
  if target is null then raise exception 'FRIEND_CODE_NOT_FOUND'; end if;
  if target = me then raise exception 'CANNOT_ADD_SELF'; end if;

  select * into existing from friendships
  where least(requester_id, addressee_id) = least(me, target)
    and greatest(requester_id, addressee_id) = greatest(me, target);

  if found then
    if existing.status = 'accepted' then
      if p_source in ('nfc', 'keyring') then
        update friendships set meet_count = meet_count + 1 where id = existing.id returning * into existing;
      end if;
      return existing;
    elsif existing.addressee_id = me then
      update friendships set status = 'accepted', accepted_at = now()
      where id = existing.id returning * into existing;
      return existing;
    else
      raise exception 'REQUEST_ALREADY_SENT';
    end if;
  end if;

  -- 키링/NFC로 직접 만난 경우는 서로 확인한 것으로 보고 바로 친구
  insert into friendships (requester_id, addressee_id, source, status, accepted_at, meet_count)
  values (me, target, p_source,
          case when p_source in ('nfc', 'keyring') then 'accepted' else 'pending' end,
          case when p_source in ('nfc', 'keyring') then now() end,
          case when p_source in ('nfc', 'keyring') then 1 else 0 end)
  returning * into existing;
  return existing;
end $$;

create or replace function public.respond_friend_request(p_friendship_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); f friendships;
begin
  select * into f from friendships where id = p_friendship_id;
  if not found or f.addressee_id <> me then raise exception 'REQUEST_NOT_FOUND'; end if;
  if f.status <> 'pending' then raise exception 'REQUEST_ALREADY_HANDLED'; end if;
  if p_accept then
    update friendships set status = 'accepted', accepted_at = now() where id = f.id;
  else
    delete from friendships where id = f.id;
  end if;
end $$;

create or replace function public.toggle_friend_favorite(p_friendship_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); f friendships; result boolean;
begin
  select * into f from friendships where id = p_friendship_id and status = 'accepted';
  if not found or me not in (f.requester_id, f.addressee_id) then raise exception 'FRIEND_NOT_FOUND'; end if;
  if f.requester_id = me then
    update friendships set requester_favorite = not requester_favorite where id = f.id returning requester_favorite into result;
  else
    update friendships set addressee_favorite = not addressee_favorite where id = f.id returning addressee_favorite into result;
  end if;
  return result;
end $$;

create or replace function public.remove_friend(p_friendship_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from friendships
  where id = p_friendship_id and auth.uid() in (requester_id, addressee_id);
  if not found then raise exception 'FRIEND_NOT_FOUND'; end if;
end $$;

-- -------------------------------------------------------------
-- 3. fams & fam_members
-- -------------------------------------------------------------
create table if not exists public.fams (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 20),
  color            text not null default 'purple',
  owner_id         uuid not null references auth.users(id) on delete cascade,
  invite_code      text not null unique,        -- 4자리. 화면에는 PAIRY-7K2Q 로 표시
  invite_expires_at timestamptz not null default now() + interval '7 days',
  max_members      int  not null default 20 check (max_members between 2 and 30),
  created_at       timestamptz not null default now()
);
alter table public.fams drop column if exists emoji;
alter table public.fams drop column if exists description;
alter table public.fams drop constraint if exists fams_color_check;
update public.fams set color = 'purple' where color not in ('purple', 'teal', 'coral', 'periwinkle');
alter table public.fams add constraint fams_color_check check (color in ('purple', 'teal', 'coral', 'periwinkle'));

create table if not exists public.fam_members (
  fam_id    uuid not null references public.fams(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (fam_id, user_id)
);
create index if not exists fam_members_user_idx on public.fam_members(user_id);

create or replace function public.is_fam_member(p_fam_id uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from fam_members where fam_id = p_fam_id and user_id = p_user);
$$;

create or replace function public.share_a_fam(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from fam_members m1 join fam_members m2 on m1.fam_id = m2.fam_id
    where m1.user_id = a and m2.user_id = b
  );
$$;

-- "PAIRY-7K2Q", "pairy-7k2q", "7K2Q" (예전 표기 PARIY- 포함) 모두 같은 코드로
create or replace function public.normalize_fam_code(p_code text)
returns text language sql immutable as $$
  select regexp_replace(upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')), '^PA(IR|RI)Y-?', '');
$$;

alter table public.fams enable row level security;
alter table public.fam_members enable row level security;

drop policy if exists "fams_read_member" on public.fams;
create policy "fams_read_member" on public.fams
  for select to authenticated using (public.is_fam_member(id));
drop policy if exists "fams_update_owner" on public.fams;
create policy "fams_update_owner" on public.fams
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "fam_members_read_member" on public.fam_members;
create policy "fam_members_read_member" on public.fam_members
  for select to authenticated using (public.is_fam_member(fam_id));

-- 팸 만들기: 이름 + 컬러 + 친구 선택 (수락된 친구만 바로 멤버로)
drop function if exists public.create_fam(text, text, text, text, int);
create or replace function public.create_fam(
  p_name text, p_color text default 'purple', p_member_ids uuid[] default '{}')
returns public.fams
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); f fams; code text; uid uuid;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'FAM_NAME_REQUIRED'; end if;
  if (select count(*) from fam_members where user_id = me) >= 10 then raise exception 'TOO_MANY_FAMS'; end if;
  if coalesce(array_length(p_member_ids, 1), 0) + 1 > 20 then raise exception 'FAM_FULL'; end if;
  loop
    code := gen_code(4);
    exit when not exists (select 1 from fams where invite_code = code);
  end loop;
  insert into fams (name, color, owner_id, invite_code)
  values (trim(p_name), coalesce(p_color, 'purple'), me, code)
  returning * into f;
  insert into fam_members (fam_id, user_id, role) values (f.id, me, 'owner');
  foreach uid in array coalesce(p_member_ids, '{}') loop
    if uid <> me and are_friends(me, uid) then
      insert into fam_members (fam_id, user_id) values (f.id, uid) on conflict do nothing;
    end if;
  end loop;
  return f;
end $$;

-- 내 팸 목록 (홈 · 팸 탭 · 친구 목록의 팸 배지용)
create or replace function public.my_fams()
returns table (id uuid, name text, color text, owner_id uuid, invite_code text,
               invite_expires_at timestamptz, max_members int, created_at timestamptz,
               member_count int, today_steps int, members jsonb)
language sql stable security definer set search_path = public as $$
  select f.id, f.name, f.color, f.owner_id, f.invite_code, f.invite_expires_at, f.max_members, f.created_at,
         (select count(*)::int from fam_members m where m.fam_id = f.id),
         (select coalesce(sum(s.steps), 0)::int from fam_members m
            join daily_steps s on s.user_id = m.user_id and s.day = kst_today()
          where m.fam_id = f.id),
         (select jsonb_agg(jsonb_build_object('user_id', p.id, 'nickname', p.nickname) order by m.joined_at)
            from fam_members m join profiles p on p.id = m.user_id where m.fam_id = f.id)
  from fams f
  where exists (select 1 from fam_members me where me.fam_id = f.id and me.user_id = auth.uid())
  order by f.created_at desc;
$$;

drop function if exists public.preview_fam_by_code(text);
create or replace function public.preview_fam_by_code(p_code text)
returns table (fam_id uuid, name text, color text, member_count int, max_members int,
               expired boolean, already_member boolean, members jsonb)
language sql stable security definer set search_path = public as $$
  select f.id, f.name, f.color,
         (select count(*)::int from fam_members m where m.fam_id = f.id),
         f.max_members,
         f.invite_expires_at < now(),
         exists (select 1 from fam_members m where m.fam_id = f.id and m.user_id = auth.uid()),
         (select jsonb_agg(jsonb_build_object('user_id', p.id, 'nickname', p.nickname) order by m.joined_at)
            from fam_members m join profiles p on p.id = m.user_id where m.fam_id = f.id)
  from fams f where f.invite_code = normalize_fam_code(p_code);
$$;

create or replace function public.join_fam_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); f fams; cnt int;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into f from fams where invite_code = normalize_fam_code(p_code) for update;
  if not found then raise exception 'INVITE_CODE_NOT_FOUND'; end if;
  if exists (select 1 from fam_members where fam_id = f.id and user_id = me) then return f.id; end if;
  if f.invite_expires_at < now() then raise exception 'INVITE_CODE_EXPIRED'; end if;
  select count(*) into cnt from fam_members where fam_id = f.id;
  if cnt >= f.max_members then raise exception 'FAM_FULL'; end if;
  insert into fam_members (fam_id, user_id, role) values (f.id, me, 'member');
  return f.id;
end $$;

create or replace function public.regenerate_fam_code(p_fam_id uuid)
returns public.fams language plpgsql security definer set search_path = public as $$
declare f fams; code text;
begin
  select * into f from fams where id = p_fam_id;
  if not found or f.owner_id <> auth.uid() then raise exception 'NOT_FAM_OWNER'; end if;
  loop
    code := gen_code(4);
    exit when not exists (select 1 from fams where invite_code = code);
  end loop;
  update fams set invite_code = code, invite_expires_at = now() + interval '7 days'
  where id = p_fam_id returning * into f;
  return f;
end $$;

-- 나가기. 방장이 나가면 가장 오래된 멤버에게 위임, 혼자였으면 팸 삭제
create or replace function public.leave_fam(p_fam_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); f fams; next_owner uuid;
begin
  select * into f from fams where id = p_fam_id for update;
  if not found or not is_fam_member(p_fam_id, me) then raise exception 'FAM_NOT_FOUND'; end if;
  delete from fam_members where fam_id = p_fam_id and user_id = me;
  if f.owner_id = me then
    select user_id into next_owner from fam_members where fam_id = p_fam_id order by joined_at limit 1;
    if next_owner is null then
      delete from fams where id = p_fam_id;
    else
      update fams set owner_id = next_owner where id = p_fam_id;
      update fam_members set role = 'owner' where fam_id = p_fam_id and user_id = next_owner;
    end if;
  end if;
end $$;

create or replace function public.kick_fam_member(p_fam_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from fams where id = p_fam_id and owner_id = auth.uid()) then
    raise exception 'NOT_FAM_OWNER';
  end if;
  if p_user_id = auth.uid() then raise exception 'USE_LEAVE_INSTEAD'; end if;
  delete from fam_members where fam_id = p_fam_id and user_id = p_user_id;
end $$;

-- -------------------------------------------------------------
-- 4. safety_settings (15_danger_settings)
-- -------------------------------------------------------------
create table if not exists public.safety_settings (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  fall_detection_enabled   boolean not null default true,
  fall_sensitivity         text not null default 'normal' check (fall_sensitivity in ('low', 'normal', 'high')),
  wait_seconds             int  not null default 10 check (wait_seconds between 5 and 60),
  notify_fams              boolean not null default true,
  notify_friends           boolean not null default false,  -- 기본은 팸에게만
  geofence_enabled         boolean not null default false,  -- 안전 구역 이탈 알림
  inactivity_alert_enabled boolean not null default false,  -- 장시간(2시간) 무움직임 알림
  updated_at               timestamptz not null default now()
);
alter table public.safety_settings add column if not exists geofence_enabled boolean not null default false;
alter table public.safety_settings add column if not exists inactivity_alert_enabled boolean not null default false;
alter table public.safety_settings drop column if exists alert_sound;
alter table public.safety_settings drop column if exists alert_vibration;
alter table public.safety_settings drop column if exists share_location;

alter table public.safety_settings enable row level security;
drop policy if exists "safety_own" on public.safety_settings;
create policy "safety_own" on public.safety_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists safety_touch on public.safety_settings;
create trigger safety_touch before update on public.safety_settings
  for each row execute function public.touch_updated_at();

create trigger steps_touch before update on public.daily_steps
  for each row execute function public.touch_updated_at();

drop trigger if exists on_auth_user_created_pairy on auth.users;
create trigger on_auth_user_created_pairy
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------
-- 5. emergency_alerts + alert_recipients
--
--  status
--    countdown ──취소──────────────▶ cancelled
--        ├─ 즉시 요청 / 0초 ────────▶ sent ──(본인 or 응답한 사람 종료)──▶ resolved
--        └─ 앱 꺼짐(대기+30초, cron) ┘  auto_sent = true
--
--  받는 사람별 status (alert_recipients)
--    delivered(전달됨) → seen(확인했어요) → calling(전화 거는 중) / on_the_way(가는 중)
--    delivered 로는 되돌아가지 않음. emergency_alerts.response_status 는 가장 앞선 응답의 요약
-- -------------------------------------------------------------
create table if not exists public.emergency_alerts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  kind             text not null default 'fall' check (kind in ('fall', 'sos')),
  trigger_source   text not null default 'keyring' check (trigger_source in ('keyring', 'manual', 'test')),
  status           text not null default 'countdown' check (status in ('countdown', 'cancelled', 'sent', 'resolved')),
  countdown_seconds int not null default 10,
  send_reason      text check (send_reason in ('timeout', 'manual', 'auto')),
  auto_sent        boolean not null default false,
  started_at       timestamptz not null default now(),
  sent_at          timestamptz,
  cancelled_at     timestamptz,
  resolved_at      timestamptz,
  response_status  text not null default 'waiting',
  responder_id     uuid references auth.users(id) on delete set null,
  responded_at     timestamptz,
  notified_count   int not null default 0
);
alter table public.emergency_alerts add column if not exists send_reason text;
-- 위치 (넘어진 사람 폰의 GPS. 알림이 끝나면 더 이상 갱신하지 않음)
alter table public.emergency_alerts add column if not exists latitude double precision;
alter table public.emergency_alerts add column if not exists longitude double precision;
alter table public.emergency_alerts add column if not exists accuracy_m real;
alter table public.emergency_alerts add column if not exists address text;          -- "서울 마포구 월드컵로 212" (못 구하면 null)
alter table public.emergency_alerts add column if not exists location_updated_at timestamptz;
alter table public.emergency_alerts drop constraint if exists emergency_alerts_response_status_check;
update public.emergency_alerts set response_status = 'calling' where response_status = 'called_119';
alter table public.emergency_alerts add constraint emergency_alerts_response_status_check
  check (response_status in ('waiting', 'seen', 'calling', 'on_the_way'));
create index if not exists emergency_alerts_user_idx on public.emergency_alerts(user_id, started_at desc);
create index if not exists emergency_alerts_status_idx on public.emergency_alerts(status) where status in ('countdown', 'sent');

create table if not exists public.alert_recipients (
  alert_id   uuid not null references public.emergency_alerts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'delivered' check (status in ('delivered', 'seen', 'calling', 'on_the_way')),
  updated_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);
create index if not exists alert_recipients_user_idx on public.alert_recipients(user_id);

-- 순위: 응답은 앞으로만 진행
create or replace function public.response_rank(s text)
returns int language sql immutable as $$
  select case s when 'seen' then 1 when 'calling' then 2 when 'on_the_way' then 3 else 0 end;
$$;

-- 이 사람이 넘어지면 알림을 받을 사람들 (설정에 따라 팸 / 친구)
create or replace function public.alert_recipient_ids(p_owner uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct uid from (
    select m2.user_id as uid from fam_members m1 join fam_members m2 on m1.fam_id = m2.fam_id
    where m1.user_id = p_owner and m2.user_id <> p_owner
      and coalesce((select notify_fams from safety_settings where user_id = p_owner), true)
    union
    select case when requester_id = p_owner then addressee_id else requester_id end
    from friendships
    where status = 'accepted' and p_owner in (requester_id, addressee_id)
      and coalesce((select notify_friends from safety_settings where user_id = p_owner), false)
  ) t;
$$;

-- RLS 순환을 피하려고 security definer 로 확인
-- (예전 버전의 같은 이름 함수가 있으면 정책과 함께 지우고 다시 만듦)
drop policy if exists "alerts_read_recipient" on public.emergency_alerts;
drop function if exists public.is_alert_recipient(uuid, uuid);
create or replace function public.is_alert_owner(p_alert_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from emergency_alerts where id = p_alert_id and user_id = auth.uid());
$$;
create or replace function public.is_alert_recipient(p_alert_id uuid, p_viewer uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from alert_recipients where alert_id = p_alert_id and user_id = p_viewer);
$$;

alter table public.emergency_alerts enable row level security;
alter table public.alert_recipients enable row level security;
drop policy if exists "alerts_read_own" on public.emergency_alerts;
create policy "alerts_read_own" on public.emergency_alerts
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "alerts_read_recipient" on public.emergency_alerts;
create policy "alerts_read_recipient" on public.emergency_alerts
  for select to authenticated using (public.is_alert_recipient(id));
drop policy if exists "recipients_read" on public.alert_recipients;
create policy "recipients_read" on public.alert_recipients
  for select to authenticated using (user_id = auth.uid() or public.is_alert_owner(alert_id));

-- 전송 처리 공용: 상태 변경 + 받는 사람 기록
create or replace function public.mark_alert_sent(p_alert_id uuid, p_reason text)
returns public.emergency_alerts
language plpgsql security definer set search_path = public as $$
declare a emergency_alerts; n int;
begin
  update emergency_alerts set status = 'sent', sent_at = now(), send_reason = p_reason,
         auto_sent = (p_reason = 'auto')
  where id = p_alert_id and status = 'countdown' returning * into a;
  insert into alert_recipients (alert_id, user_id)
  select a.id, uid from alert_recipient_ids(a.user_id) uid
  on conflict do nothing;
  get diagnostics n = row_count;
  update emergency_alerts set notified_count = n where id = a.id returning * into a;
  return a;
end $$;

-- 낙상 감지 시작 (타이머 시작). 진행 중인 카운트다운이 있으면 그걸 돌려줌
create or replace function public.start_fall_alert(p_source text default 'keyring', p_kind text default 'fall')
returns public.emergency_alerts
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a emergency_alerts; secs int;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into a from emergency_alerts
  where user_id = me and status = 'countdown'
    and started_at > now() - make_interval(secs => countdown_seconds + 30)
  order by started_at desc limit 1;
  if found then return a; end if;

  if p_kind = 'fall' and exists (
    select 1 from safety_settings where user_id = me and fall_detection_enabled = false
  ) then
    raise exception 'FALL_DETECTION_DISABLED';
  end if;

  select coalesce((select wait_seconds from safety_settings where user_id = me), 10) into secs;
  insert into emergency_alerts (user_id, kind, trigger_source, countdown_seconds)
  values (me, p_kind, p_source, case when p_kind = 'sos' then 0 else secs end)
  returning * into a;
  return a;
end $$;

create or replace function public.cancel_fall_alert(p_alert_id uuid)
returns public.emergency_alerts
language plpgsql security definer set search_path = public as $$
declare a emergency_alerts;
begin
  select * into a from emergency_alerts where id = p_alert_id and user_id = auth.uid() for update;
  if not found then raise exception 'ALERT_NOT_FOUND'; end if;
  if a.status = 'cancelled' then return a; end if;
  if a.status <> 'countdown' then raise exception 'ALERT_ALREADY_SENT'; end if;
  update emergency_alerts set status = 'cancelled', cancelled_at = now()
  where id = a.id returning * into a;
  return a;
end $$;

drop function if exists public.send_fall_alert(uuid, double precision, double precision, double precision);
drop function if exists public.send_fall_alert(uuid, double precision, double precision, double precision, text, text);
drop function if exists public.update_alert_location(uuid, double precision, double precision, double precision);
drop function if exists public.update_alert_location(uuid, double precision, double precision, double precision, text);

-- 위치 올리기: 본인만, 진행 중(countdown/sent)인 알림에만
create or replace function public.update_alert_location(
  p_alert_id uuid, p_lat double precision, p_lng double precision,
  p_accuracy double precision default null, p_address text default null)
returns public.emergency_alerts
language plpgsql security definer set search_path = public as $$
declare a emergency_alerts;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'INVALID_LOCATION';
  end if;
  select * into a from emergency_alerts where id = p_alert_id and user_id = auth.uid() for update;
  if not found then raise exception 'ALERT_NOT_FOUND'; end if;
  if a.status not in ('countdown', 'sent') then return a; end if;   -- 끝난 알림은 위치를 더 받지 않음
  update emergency_alerts
     set latitude = p_lat, longitude = p_lng, accuracy_m = p_accuracy,
         address = coalesce(nullif(left(trim(p_address), 120), ''), address),
         location_updated_at = now()
   where id = a.id returning * into a;
  return a;
end $$;

create or replace function public.send_fall_alert(p_alert_id uuid, p_reason text default 'manual')
returns public.emergency_alerts
language plpgsql security definer set search_path = public as $$
declare a emergency_alerts;
begin
  select * into a from emergency_alerts where id = p_alert_id and user_id = auth.uid() for update;
  if not found then raise exception 'ALERT_NOT_FOUND'; end if;
  if a.status = 'sent' then return a; end if;              -- 타이머와 버튼이 동시에 와도 1번만
  if a.status <> 'countdown' then raise exception 'ALERT_NOT_ACTIVE'; end if;
  return mark_alert_sent(a.id, case when p_reason in ('timeout', 'manual') then p_reason else 'manual' end);
end $$;

-- 종료: 본인("나는 괜찮아요") 또는 응답한 받는 사람
create or replace function public.resolve_fall_alert(p_alert_id uuid)
returns public.emergency_alerts
language plpgsql security definer set search_path = public as $$
declare a emergency_alerts;
begin
  select * into a from emergency_alerts where id = p_alert_id for update;
  if not found or not (
    a.user_id = auth.uid()
    or exists (select 1 from alert_recipients r where r.alert_id = a.id and r.user_id = auth.uid() and r.status <> 'delivered')
  ) then
    raise exception 'ALERT_NOT_FOUND';
  end if;
  if a.status = 'resolved' then return a; end if;
  if a.status <> 'sent' then raise exception 'ALERT_NOT_ACTIVE'; end if;
  update emergency_alerts set status = 'resolved', resolved_at = now()
  where id = a.id returning * into a;
  return a;
end $$;

-- 받는 사람 응답: seen / calling / on_the_way
drop function if exists public.respond_fall_alert(uuid, text);
create or replace function public.respond_fall_alert(p_alert_id uuid, p_response text)
returns public.emergency_alerts
language plpgsql security definer set search_path = public as $$
declare a emergency_alerts; r alert_recipients;
begin
  if p_response not in ('seen', 'calling', 'on_the_way') then raise exception 'INVALID_RESPONSE'; end if;
  select * into a from emergency_alerts where id = p_alert_id for update;
  select * into r from alert_recipients where alert_id = p_alert_id and user_id = auth.uid();
  if a.id is null or r.alert_id is null then raise exception 'ALERT_NOT_FOUND'; end if;
  if a.status <> 'sent' then raise exception 'ALERT_NOT_ACTIVE'; end if;
  -- '확인'은 이미 전화/출발한 상태를 덮어쓰지 않음
  if not (p_response = 'seen' and response_rank(r.status) > 1) then
    update alert_recipients set status = p_response, updated_at = now()
    where alert_id = a.id and user_id = auth.uid();
  end if;
  if response_rank(p_response) >= response_rank(a.response_status) then
    update emergency_alerts set response_status = p_response, responder_id = auth.uid(), responded_at = now()
    where id = a.id returning * into a;
  else
    -- 요약은 그대로지만 실시간 구독자에게 변경을 알리려고 시각만 갱신
    update emergency_alerts set responded_at = now() where id = a.id returning * into a;
  end if;
  return a;
end $$;

-- 앱이 꺼져 끝나지 못한 카운트다운을 자동 전송 (pg_cron으로 1분마다)
create or replace function public.flush_expired_countdowns()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; rec record;
begin
  for rec in
    select id from emergency_alerts
    where status = 'countdown' and started_at < now() - make_interval(secs => countdown_seconds + 30)
    for update skip locked
  loop
    perform mark_alert_sent(rec.id, 'auto');
    n := n + 1;
  end loop;
  return n;
end $$;
-- 대시보드에서 pg_cron 확장을 켠 뒤 한 번 실행:
--   select cron.schedule('pairy-flush-countdowns', '* * * * *', 'select public.flush_expired_countdowns()');

-- 팸 상세의 숫자들: 오늘 함께 걸음, 멤버끼리 키링 맞댄 횟수, 지금 위험한 멤버
create or replace function public.fam_stats(p_fam_id uuid)
returns table (today_steps int, meet_total int, alert_user_ids uuid[])
language sql stable security definer set search_path = public as $$
  select
    (select coalesce(sum(s.steps), 0)::int from fam_members m
       join daily_steps s on s.user_id = m.user_id and s.day = kst_today() where m.fam_id = p_fam_id),
    (select coalesce(sum(fr.meet_count), 0)::int from friendships fr
      where fr.requester_id in (select user_id from fam_members where fam_id = p_fam_id)
        and fr.addressee_id in (select user_id from fam_members where fam_id = p_fam_id)),
    (select coalesce(array_agg(distinct a.user_id), '{}') from emergency_alerts a
      where a.status in ('countdown', 'sent')
        and a.user_id in (select user_id from fam_members where fam_id = p_fam_id))
  where is_fam_member(p_fam_id);
$$;

-- 알림 상세 (본인 / 받는 사람)
drop function if exists public.get_alert_detail(uuid);
drop function if exists public.list_alert_history(int);
drop view if exists public.alert_view;
-- 상세·기록 화면이 같이 쓰는 모양 (보안: 아래 함수에서만 사용, 직접 조회 권한 없음)
create view public.alert_view with (security_invoker = false) as
  select a.id, a.user_id, p.nickname, a.kind, a.trigger_source, a.status, a.countdown_seconds,
         a.send_reason, a.auto_sent, a.started_at, a.sent_at, a.cancelled_at, a.resolved_at,
         a.response_status, a.responder_id, rp.nickname as responder_nickname, a.responded_at,
         a.notified_count,
         a.latitude, a.longitude, a.accuracy_m, a.address, a.location_updated_at
  from emergency_alerts a
  join profiles p on p.id = a.user_id
  left join profiles rp on rp.id = a.responder_id;
revoke all on public.alert_view from anon, authenticated;

create or replace function public.get_alert_detail(p_alert_id uuid)
returns table (
  id uuid, user_id uuid, nickname text, kind text, trigger_source text, status text,
  countdown_seconds int, send_reason text, auto_sent boolean,
  started_at timestamptz, sent_at timestamptz, cancelled_at timestamptz, resolved_at timestamptz,
  response_status text, responder_id uuid, responder_nickname text, responded_at timestamptz,
  notified_count int,
  latitude double precision, longitude double precision, accuracy_m real, address text, location_updated_at timestamptz,
  my_status text, is_mine boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.user_id, v.nickname, v.kind, v.trigger_source, v.status, v.countdown_seconds,
         v.send_reason, v.auto_sent, v.started_at, v.sent_at, v.cancelled_at, v.resolved_at,
         v.response_status, v.responder_id, v.responder_nickname, v.responded_at, v.notified_count,
         v.latitude, v.longitude, v.accuracy_m, v.address, v.location_updated_at,
         (select r.status from alert_recipients r where r.alert_id = v.id and r.user_id = auth.uid()),
         v.user_id = auth.uid()
  from alert_view v
  where v.id = p_alert_id
    and (v.user_id = auth.uid() or is_alert_recipient(v.id));
$$;

-- 알림 기록 (내 낙상 + 내가 받은 알림), 최신순
create or replace function public.list_alert_history(p_limit int default 30)
returns table (
  id uuid, user_id uuid, nickname text, kind text, trigger_source text, status text,
  countdown_seconds int, send_reason text, auto_sent boolean,
  started_at timestamptz, sent_at timestamptz, cancelled_at timestamptz, resolved_at timestamptz,
  response_status text, responder_id uuid, responder_nickname text, responded_at timestamptz,
  notified_count int,
  latitude double precision, longitude double precision, accuracy_m real, address text, location_updated_at timestamptz,
  my_status text, is_mine boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.user_id, v.nickname, v.kind, v.trigger_source, v.status, v.countdown_seconds,
         v.send_reason, v.auto_sent, v.started_at, v.sent_at, v.cancelled_at, v.resolved_at,
         v.response_status, v.responder_id, v.responder_nickname, v.responded_at, v.notified_count,
         v.latitude, v.longitude, v.accuracy_m, v.address, v.location_updated_at,
         (select r.status from alert_recipients r where r.alert_id = v.id and r.user_id = auth.uid()),
         v.user_id = auth.uid()
  from alert_view v
  where v.user_id = auth.uid() or is_alert_recipient(v.id)
  order by v.started_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- 내가 넘어지면 알림을 받을 사람 수 (홈 · 설정 화면 요약)
create or replace function public.my_alert_recipient_count()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from alert_recipient_ids(auth.uid());
$$;


-- 11_fall_sos_sent "알림 받은 팸" 목록
create or replace function public.get_alert_recipients(p_alert_id uuid)
returns table (user_id uuid, nickname text, status text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.user_id, p.nickname, r.status, r.updated_at
  from alert_recipients r join profiles p on p.id = r.user_id
  where r.alert_id = p_alert_id
    and (is_alert_owner(p_alert_id) or is_alert_recipient(p_alert_id))
  order by response_rank(r.status) desc, p.nickname;
$$;

-- 테이블 직접 쓰기 권한 회수 (RPC로만 변경)
revoke insert, update, delete on public.friendships, public.fams, public.fam_members,
  public.emergency_alerts, public.alert_recipients from anon, authenticated;
-- 내부용 함수는 public 에서도 회수해야 막힘 (Postgres 는 함수 실행 권한을 public 에 기본으로 줌)
--   mark_alert_sent        : 남의 카운트다운 알림을 강제로 전송할 수 있었음
--   alert_recipient_ids    : 아무 사용자의 팸·친구 id 목록을 볼 수 있었음
revoke execute on function public.flush_expired_countdowns() from public, anon, authenticated;
revoke execute on function public.mark_alert_sent(uuid, text) from public, anon, authenticated;
revoke execute on function public.alert_recipient_ids(uuid) from public, anon, authenticated;
grant update (name, color, max_members) on public.fams to authenticated;

-- -------------------------------------------------------------
-- 6. 실시간 (넘어지면 바로 알림, 응답 상태 바로 반영)
-- -------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['emergency_alerts', 'alert_recipients', 'fam_members', 'daily_steps'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;
