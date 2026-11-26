-- =============================================================
--  Pairy A 파트 (2): 명함 칼럼 · 명함 저장 · 오늘의 갓생 영수증
--  B 파트 SQL → A 파트 SQL(20261125000000_...) 다음에 실행합니다.
--  여러 번 실행해도 안전하게 작성했습니다.
--
--  profiles 는 B 파트와 함께 쓰는 테이블이라 칼럼만 "추가" 합니다. (기존 칼럼은 그대로)
--    affiliation    소속          "서울 · 디자인 전공"
--    bio            한 줄 소개    "사진 찍고, 달리고, 가끔 그림 그려요."
--    instagram      인스타 아이디 "haeun.dsn"  (@ 없이 저장)
--    behance        비핸스 아이디 "haeun"
--    portfolio_url  포트폴리오 주소 "https://..."
--
--  함수
--    update_my_profile(..)  04 명함 편집 · 00 회원가입 2단계. 값 검증 + @아이디 중복 확인
--    my_receipt()           16 오늘의 갓생 영수증에 필요한 숫자 (걸음 · 목표 · 오늘 맞대기 · 키링)
-- =============================================================

alter table public.profiles add column if not exists affiliation   text;
alter table public.profiles add column if not exists bio           text;
alter table public.profiles add column if not exists instagram     text;
alter table public.profiles add column if not exists behance       text;
alter table public.profiles add column if not exists portfolio_url text;

-- @아이디는 대소문자 구분 없이 한 사람만 (기존에 같은 값이 있으면 인덱스를 만들지 않고 함수에서만 확인)
do $$
begin
  if not exists (
    select 1 from public.profiles where handle is not null group by lower(handle) having count(*) > 1
  ) then
    create unique index if not exists profiles_handle_lower_key on public.profiles (lower(handle)) where handle is not null;
  end if;
end $$;

-- -------------------------------------------------------------
-- 명함 저장
--   null  = 그대로 두기
--   ''    = 비우기 (닉네임은 비울 수 없음)
--   tags  = 넘기면 통째로 바꿈 (최대 6개, 각 12자)
-- -------------------------------------------------------------
drop function if exists public.update_my_profile(text, text, text, text, text[], text, text, text);
create or replace function public.update_my_profile(
  p_nickname text default null,
  p_handle text default null,
  p_affiliation text default null,
  p_bio text default null,
  p_tags text[] default null,
  p_instagram text default null,
  p_behance text default null,
  p_portfolio_url text default null)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  p profiles;
  v_handle text;
  v_url text;
  v_tags text[];
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into p from profiles where id = me for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  if p_nickname is not null then
    if length(trim(p_nickname)) = 0 then raise exception 'NICKNAME_REQUIRED'; end if;
    if length(trim(p_nickname)) > 20 then raise exception 'TEXT_TOO_LONG'; end if;
    p.nickname := trim(p_nickname);
  end if;

  if p_handle is not null then
    v_handle := lower(regexp_replace(trim(p_handle), '^@', ''));
    if v_handle = '' then
      p.handle := null;
    else
      if v_handle !~ '^[a-z0-9._]{2,30}$' then raise exception 'INVALID_HANDLE'; end if;
      if exists (select 1 from profiles where lower(handle) = v_handle and id <> me) then
        raise exception 'HANDLE_TAKEN';
      end if;
      p.handle := v_handle;
    end if;
  end if;

  if p_affiliation is not null then
    if length(trim(p_affiliation)) > 30 then raise exception 'TEXT_TOO_LONG'; end if;
    p.affiliation := nullif(trim(p_affiliation), '');
  end if;

  if p_bio is not null then
    if length(trim(p_bio)) > 60 then raise exception 'TEXT_TOO_LONG'; end if;
    p.bio := nullif(trim(p_bio), '');
  end if;

  if p_tags is not null then
    -- '#' 떼고 공백 정리, 같은 태그(대소문자 무시)는 처음 것만, 입력한 순서 유지
    select coalesce(array_agg(t order by ord), '{}') into v_tags from (
      select distinct on (lower(t)) t, ord from (
        select trim(regexp_replace(x, '^#', '')) as t, ord from unnest(p_tags) with ordinality as u(x, ord)
      ) s where t <> '' order by lower(t), ord
    ) d;
    if cardinality(v_tags) > 6 then raise exception 'TOO_MANY_TAGS'; end if;
    if exists (select 1 from unnest(v_tags) t where length(t) > 12) then raise exception 'TEXT_TOO_LONG'; end if;
    p.tags := v_tags;
  end if;

  if p_instagram is not null then
    if length(trim(p_instagram)) > 40 then raise exception 'TEXT_TOO_LONG'; end if;
    p.instagram := nullif(regexp_replace(trim(p_instagram), '^@', ''), '');
  end if;

  if p_behance is not null then
    if length(trim(p_behance)) > 40 then raise exception 'TEXT_TOO_LONG'; end if;
    p.behance := nullif(regexp_replace(trim(p_behance), '^@', ''), '');
  end if;

  if p_portfolio_url is not null then
    v_url := trim(p_portfolio_url);
    if v_url = '' then
      p.portfolio_url := null;
    else
      if v_url !~* '^https?://' then v_url := 'https://' || v_url; end if;
      if length(v_url) > 200 or v_url !~* '^https?://[^\s/$.?#].[^\s]*$' then raise exception 'INVALID_URL'; end if;
      p.portfolio_url := v_url;
    end if;
  end if;

  update profiles set
    nickname = p.nickname, handle = p.handle, affiliation = p.affiliation, bio = p.bio,
    tags = p.tags, instagram = p.instagram, behance = p.behance, portfolio_url = p.portfolio_url
  where id = me
  returning * into p;
  return p;
end $$;

-- -------------------------------------------------------------
-- 오늘의 갓생 영수증 (KST 오늘 기준)
--   steps        오늘 걸음 (daily_steps)
--   goal         하루 목표 (profiles.step_goal)
--   meets_today  오늘 키링 맞대기 횟수 (device_meets)
--   new_friends  오늘 새로 생긴 친구 수
--   meet_total   키링 누적 맞대기 (devices.meet_count 합)
--   device_id    가장 최근에 연결된 키링 id (없으면 null)
-- -------------------------------------------------------------
create or replace function public.my_receipt()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  day_start timestamptz := (kst_today()::timestamp at time zone 'Asia/Seoul');
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return jsonb_build_object(
    'day', kst_today(),
    'steps', coalesce((select steps from daily_steps where user_id = me and day = kst_today()), 0),
    'goal', coalesce((select step_goal from profiles where id = me), 5000),
    'meets_today', (select count(*) from device_meets where user_id = me and created_at >= day_start),
    'new_friends', (select count(*) from friendships
                     where me in (requester_id, addressee_id) and status = 'accepted' and accepted_at >= day_start),
    'meet_total', coalesce((select sum(meet_count) from devices where user_id = me), 0),
    'device_id', (select id from devices where user_id = me order by last_seen_at desc nulls last, created_at desc limit 1)
  );
end $$;

revoke execute on function public.update_my_profile(text, text, text, text, text[], text, text, text) from public, anon;
revoke execute on function public.my_receipt() from public, anon;
grant execute on function public.update_my_profile(text, text, text, text, text[], text, text, text) to authenticated;
grant execute on function public.my_receipt() to authenticated;
