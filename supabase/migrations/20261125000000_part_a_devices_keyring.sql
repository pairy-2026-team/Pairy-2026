-- =============================================================
--  Pairy A 파트: 기기(키링) 등록 · 키링 → 서버 연결
--  B 파트 SQL(20261124000000_...) 을 먼저 실행한 뒤 SQL Editor에 붙여 넣어 실행합니다.
--  여러 번 실행해도 안전하게 작성했습니다.
--
--  왜 이렇게 만들었나
--    키링은 사람처럼 로그인할 수 없어서 공개 키(anon key)로만 요청을 보냅니다.
--    anon key 는 펌웨어·웹 코드에 들어가므로 "비밀이 아니다" 라고 보고,
--    테이블을 anon 에게 직접 열지 않습니다.
--
--    대신 키링마다 "기기 ID + 기기 비밀키" 를 하나씩 발급하고,
--    키링은 아래 device_* 함수만 부를 수 있습니다.
--    함수가 비밀키를 확인한 뒤에 그 키링 주인의 데이터만 바꿉니다.
--
--      웹(로그인한 사람)  register_device()  ──▶ 기기 ID + 비밀키 발급 (비밀키는 이때 한 번만 보여 줌)
--      펌웨어 secrets.h   DEVICE_ID / DEVICE_SECRET 에 붙여 넣고 업로드
--      키링 ──anon key──▶ device_report / device_fall / device_meet (비밀키 확인 후 처리)
--
--    DB에는 비밀키 원문 대신 sha256 해시만 저장합니다. (DB가 털려도 비밀키는 모름)
--
--  테이블
--    devices        키링 (주인 · 이름 · 마지막 연결 시각 · 배터리 · 맞대기 횟수)
--    device_meets   키링 맞대기 기록 (두 키링이 몇 초 안에 같이 보고하면 서로 짝지음)
--
--  키링이 쓰는 함수 (anon 으로 호출 가능, 비밀키 필수)
--    device_report(..)  10초마다: 걸음 수(늘어난 만큼) 보고 + 설정·알림 상태 받아 가기
--    device_fall(..)    낙상 상태 전이: detected / cancel / emergency / resolve
--    device_meet(..)    친구 키링 맞대기
-- =============================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------
-- 1. devices
-- -------------------------------------------------------------
create table if not exists public.devices (
  id            uuid primary key default gen_random_uuid(),   -- = 펌웨어의 DEVICE_ID
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null default 'Pairy 키링',
  secret_hash   text not null,                                 -- sha256(비밀키) 16진수. 원문은 저장 안 함
  battery       int check (battery between 0 and 100),
  firmware      text,
  meet_count    int not null default 0,                        -- 이 키링으로 맞댄 횟수 (짝을 못 찾은 것도 포함)
  last_seen_at  timestamptz,                                   -- 마지막으로 서버에 보고한 시각 -> 연결 상태
  last_boot_id  text,                                          -- 중복 보고 막기 (전원 켤 때마다 바뀌는 값)
  last_seq      int not null default 0,                        -- 중복 보고 막기 (보고 순번)
  created_at    timestamptz not null default now()
);
create index if not exists devices_user_idx on public.devices(user_id, created_at desc);

alter table public.devices enable row level security;
drop policy if exists "devices_read_own" on public.devices;
create policy "devices_read_own" on public.devices
  for select to authenticated using (user_id = auth.uid());

-- 비밀키 해시는 본인에게도 보여 줄 필요가 없음 -> 칼럼 단위로 읽기 권한 제한
revoke all on public.devices from anon, authenticated;
grant select (id, user_id, name, battery, firmware, meet_count, last_seen_at, created_at)
  on public.devices to authenticated;

-- 맞대기 기록: 함수로만 읽고 씀 (정책 없음 = 아무도 직접 못 읽음)
create table if not exists public.device_meets (
  id          bigint generated always as identity primary key,
  device_id   uuid not null references public.devices(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  matched     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists device_meets_recent_idx on public.device_meets(created_at desc) where not matched;
alter table public.device_meets enable row level security;
revoke all on public.device_meets from anon, authenticated;

-- -------------------------------------------------------------
-- 2. 웹(로그인한 사람)이 쓰는 함수: 등록 · 목록 · 비밀키 재발급 · 삭제
-- -------------------------------------------------------------

-- 비밀키 만들기: 32글자 16진수 (128비트, 추측 불가)
create or replace function public.gen_device_secret()
returns text language sql volatile set search_path = public, extensions as $$
  select encode(gen_random_bytes(16), 'hex');
$$;

create or replace function public.hash_device_secret(p_secret text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(digest(coalesce(p_secret, ''), 'sha256'), 'hex');
$$;

-- 키링 등록: 비밀키 원문은 여기서 딱 한 번만 돌려준다
drop function if exists public.register_device(text);
create or replace function public.register_device(p_name text default null)
returns table (device_id uuid, secret text)
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); s text := gen_device_secret(); d devices;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if (select count(*) from devices where user_id = me) >= 5 then raise exception 'TOO_MANY_DEVICES'; end if;
  insert into devices (user_id, name, secret_hash)
  values (me, coalesce(nullif(left(trim(p_name), 30), ''), 'Pairy 키링'), hash_device_secret(s))
  returning * into d;
  return query select d.id, s;
end $$;

-- 비밀키를 잃어버렸거나 노출됐을 때: 새 비밀키 발급 (이전 키는 바로 무효)
drop function if exists public.reset_device_secret(uuid);
create or replace function public.reset_device_secret(p_device_id uuid)
returns table (device_id uuid, secret text)
language plpgsql security definer set search_path = public, extensions as $$
declare s text := gen_device_secret();
begin
  update devices set secret_hash = hash_device_secret(s), last_boot_id = null, last_seq = 0
  where id = p_device_id and user_id = auth.uid();
  if not found then raise exception 'DEVICE_NOT_FOUND'; end if;
  return query select p_device_id, s;
end $$;

create or replace function public.remove_device(p_device_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from devices where id = p_device_id and user_id = auth.uid();
  if not found then raise exception 'DEVICE_NOT_FOUND'; end if;
end $$;

create or replace function public.rename_device(p_device_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if nullif(trim(p_name), '') is null then raise exception 'DEVICE_NAME_REQUIRED'; end if;
  update devices set name = left(trim(p_name), 30) where id = p_device_id and user_id = auth.uid();
  if not found then raise exception 'DEVICE_NOT_FOUND'; end if;
end $$;

-- -------------------------------------------------------------
-- 3. 키링이 쓰는 함수
-- -------------------------------------------------------------

-- 내부용: 기기 ID + 비밀키 확인. 틀리면 이유를 알려 주지 않고 같은 에러 (어느 쪽이 틀렸는지 숨김)
create or replace function public.device_auth(p_device_id uuid, p_secret text)
returns public.devices
language plpgsql security definer set search_path = public, extensions as $$
declare d devices;
begin
  select * into d from devices where id = p_device_id for update;
  if not found or d.secret_hash <> hash_device_secret(p_secret) then
    raise exception 'DEVICE_AUTH_FAILED';
  end if;
  return d;
end $$;

-- 내부용: 이 사용자의 "지금 신경 써야 할" 낙상 알림 (최근 10분)
create or replace function public.device_latest_alert(p_user uuid)
returns public.emergency_alerts
language sql stable security definer set search_path = public as $$
  select * from emergency_alerts
  where user_id = p_user and started_at > now() - interval '10 minutes'
  order by started_at desc limit 1;
$$;

-- 내부용: 키링에 돌려줄 공통 정보 (설정 + 최근 알림 상태)
create or replace function public.device_state_json(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s safety_settings; a emergency_alerts;
begin
  select * into s from safety_settings where user_id = p_user;
  a := device_latest_alert(p_user);
  return jsonb_build_object(
    'fall_enabled', coalesce(s.fall_detection_enabled, true),
    'sensitivity',  coalesce(s.fall_sensitivity, 'normal'),
    'wait_seconds', coalesce(s.wait_seconds, 10),
    'alert_id',     a.id,           -- 없으면 null
    'alert_status', coalesce(a.status, 'none')
  );
end $$;

-- 주기 보고 (10초마다, 낙상 경고 중에는 더 자주)
--   p_steps_delta : 지난 보고 이후 늘어난 걸음 수. 오늘 걸음에 더한다
--   p_boot_id, p_seq : 응답을 못 받아 같은 보고를 다시 보내도 두 번 더해지지 않게
--   돌려주는 값 : 오늘 걸음 + 설정 + 최근 알림 상태 (폰에서 취소하면 키링도 멈추게)
drop function if exists public.device_report(uuid, text, text, int, int, int, text);
create or replace function public.device_report(
  p_device_id uuid, p_secret text, p_boot_id text, p_seq int,
  p_steps_delta int default 0, p_battery int default null, p_firmware text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare d devices; dup boolean; today int;
begin
  d := device_auth(p_device_id, p_secret);
  dup := (d.last_boot_id = p_boot_id and p_seq <= d.last_seq);

  update devices set
    last_seen_at = now(),
    battery  = coalesce(case when p_battery between 0 and 100 then p_battery end, battery),
    firmware = coalesce(left(p_firmware, 40), firmware),
    last_boot_id = p_boot_id,
    last_seq = case when dup then last_seq else p_seq end
  where id = d.id;

  -- 10초에 수천 걸음은 불가능 -> 이상한 값은 버림 (0 ~ 2000)
  if not dup and p_steps_delta between 1 and 2000 then
    insert into daily_steps (user_id, day, steps) values (d.user_id, kst_today(), p_steps_delta)
    on conflict (user_id, day) do update set steps = daily_steps.steps + excluded.steps;
  end if;

  select steps into today from daily_steps where user_id = d.user_id and day = kst_today();
  return device_state_json(d.user_id)
    || jsonb_build_object('ok', true, 'duplicate', dup, 'steps_today', coalesce(today, 0));
end $$;

-- 낙상 상태 전이 (웹의 10_fall_detect 흐름과 같은 규칙)
--
--   키링 상태                 이벤트       서버 emergency_alerts
--   NORMAL -> ALERT          detected    -> countdown 만들기 (이미 있으면 그걸 사용)
--   ALERT  -> NORMAL         cancel      -> countdown 이면 cancelled
--   ALERT  -> EMERGENCY      emergency   -> countdown 이면 sent(timeout)
--                                           알림이 아예 없으면(detected 가 실패했으면) 만들고 바로 sent
--   EMERGENCY -> NORMAL      resolve     -> sent 이면 resolved ("나는 괜찮아요")
--
--   폰에서 먼저 취소/전송한 경우에도 에러 대신 지금 상태를 돌려주고,
--   키링은 돌려받은 alert_status 를 보고 자기 상태를 맞춘다.
drop function if exists public.device_fall(uuid, text, text, uuid, text);
create or replace function public.device_fall(
  p_device_id uuid, p_secret text, p_event text,
  p_alert_id uuid default null, p_source text default 'keyring')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare d devices; a emergency_alerts; secs int; src text;
begin
  d := device_auth(p_device_id, p_secret);
  update devices set last_seen_at = now() where id = d.id;
  if p_event not in ('detected', 'cancel', 'emergency', 'resolve') then raise exception 'INVALID_EVENT'; end if;
  src := case when p_source = 'test' then 'test' else 'keyring' end;

  -- 어떤 알림에 대한 이벤트인지: 키링이 받은 id 가 있으면 그것, 없으면 최근 알림
  if p_alert_id is not null then
    select * into a from emergency_alerts where id = p_alert_id and user_id = d.user_id for update;
  else
    select * into a from emergency_alerts
    where user_id = d.user_id and status in ('countdown', 'sent')
      and started_at > now() - interval '10 minutes'
    order by started_at desc limit 1 for update;
  end if;

  if p_event in ('detected', 'emergency') and (a.id is null or a.status in ('cancelled', 'resolved')) then
    if p_event = 'detected' and a.id is not null then
      a := null;   -- 끝난 알림이 남아 있어도 새 낙상은 새 알림
    end if;
    if a.id is null then
      if exists (select 1 from safety_settings where user_id = d.user_id and fall_detection_enabled = false) then
        return device_state_json(d.user_id) || jsonb_build_object('ok', false, 'error', 'FALL_DETECTION_DISABLED');
      end if;
      select coalesce((select wait_seconds from safety_settings where user_id = d.user_id), 10) into secs;
      insert into emergency_alerts (user_id, kind, trigger_source, countdown_seconds)
      values (d.user_id, 'fall', src, secs)
      returning * into a;
    end if;
  end if;

  if a.id is null then
    -- cancel / resolve 인데 대상이 없음: 이미 끝난 것으로 보고 지금 상태만 돌려줌
    return device_state_json(d.user_id) || jsonb_build_object('ok', true);
  end if;

  if p_event = 'cancel' and a.status = 'countdown' then
    update emergency_alerts set status = 'cancelled', cancelled_at = now() where id = a.id returning * into a;
  elsif p_event = 'emergency' and a.status = 'countdown' then
    a := mark_alert_sent(a.id, 'timeout');
  elsif p_event = 'resolve' and a.status = 'sent' then
    update emergency_alerts set status = 'resolved', resolved_at = now() where id = a.id returning * into a;
  end if;

  return device_state_json(d.user_id)
    || jsonb_build_object('ok', true, 'alert_id', a.id, 'alert_status', a.status);
end $$;

-- 친구 키링 맞대기
--   두 키링이 서로의 자석을 감지하면 각자 이 함수를 부른다.
--   8초 안에 다른 사람의 맞대기 기록이 있으면 그 사람과 짝지음:
--     이미 친구 -> meet_count + 1
--     친구 아님 -> 바로 친구 (B 파트 규칙: 키링/NFC로 직접 만나면 서로 확인한 것으로 봄)
--   짝이 없으면 기록만 남기고, 나중에 상대가 보고하면 그쪽에서 짝지어진다.
--   ⚠️ 시각만으로 짝을 지으므로, 같은 순간 다른 곳에서 맞댄 사람과 잘못 이어질 수 있음 (해커톤 규모에서는 괜찮음)
drop function if exists public.device_meet(uuid, text);
create or replace function public.device_meet(p_device_id uuid, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare d devices; other device_meets; f friendships; nick text;
begin
  d := device_auth(p_device_id, p_secret);
  update devices set last_seen_at = now(), meet_count = meet_count + 1 where id = d.id;

  -- 두 키링이 거의 동시에 불러도 서로 못 보고 지나치지 않게 한 줄로 세움
  perform pg_advisory_xact_lock(hashtext('pairy_device_meet'));

  select * into other from device_meets
  where not matched and user_id <> d.user_id and created_at > now() - interval '8 seconds'
  order by created_at desc limit 1 for update;

  if not found then
    insert into device_meets (device_id, user_id) values (d.id, d.user_id);
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  update device_meets set matched = true where id = other.id;
  insert into device_meets (device_id, user_id, matched) values (d.id, d.user_id, true);

  select * into f from friendships
  where least(requester_id, addressee_id) = least(d.user_id, other.user_id)
    and greatest(requester_id, addressee_id) = greatest(d.user_id, other.user_id)
  for update;

  if found then
    update friendships set meet_count = meet_count + 1,
           status = 'accepted', accepted_at = coalesce(accepted_at, now())
    where id = f.id;
  else
    insert into friendships (requester_id, addressee_id, source, status, accepted_at, meet_count)
    values (d.user_id, other.user_id, 'keyring', 'accepted', now(), 1);
  end if;

  select nickname into nick from profiles where id = other.user_id;
  return jsonb_build_object('ok', true, 'matched', true, 'friend_nickname', nick);
end $$;

-- -------------------------------------------------------------
-- 4. 권한
--    Postgres 는 함수 실행 권한을 public 에 기본으로 주므로 내부용은 꼭 회수
-- -------------------------------------------------------------
revoke execute on function public.device_auth(uuid, text) from public, anon, authenticated;
revoke execute on function public.device_latest_alert(uuid) from public, anon, authenticated;
revoke execute on function public.device_state_json(uuid) from public, anon, authenticated;
revoke execute on function public.gen_device_secret() from public, anon, authenticated;
revoke execute on function public.hash_device_secret(text) from public, anon, authenticated;

-- 웹(로그인한 사람)만
revoke execute on function public.register_device(text) from public, anon;
revoke execute on function public.reset_device_secret(uuid) from public, anon;
revoke execute on function public.remove_device(uuid) from public, anon;
revoke execute on function public.rename_device(uuid, text) from public, anon;
grant execute on function public.register_device(text) to authenticated;
grant execute on function public.reset_device_secret(uuid) to authenticated;
grant execute on function public.remove_device(uuid) to authenticated;
grant execute on function public.rename_device(uuid, text) to authenticated;

-- 키링 (anon key 로 호출. 함수 안에서 비밀키를 확인함)
grant execute on function public.device_report(uuid, text, text, int, int, int, text) to anon, authenticated;
grant execute on function public.device_fall(uuid, text, text, uuid, text) to anon, authenticated;
grant execute on function public.device_meet(uuid, text) to anon, authenticated;

-- 걸음 수(daily_steps)와 낙상(emergency_alerts)은 B 파트 SQL이 이미 실시간(supabase_realtime)에 등록해 둠
-- -> 키링이 위 함수로 값을 바꾸면 웹 홈 · 낙상 화면에 바로 뜸
-- 기기 연결 상태(devices)는 /device 화면이 5초마다 다시 불러와서 확인
