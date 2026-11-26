-- =============================================================
--  로그인한 사용자(authenticated)에게 테이블 권한 주기
--
--  왜 필요한가
--    Supabase 프로젝트를 만들 때 "새 테이블에 자동으로 권한 주기"를 끄면
--    SQL로 만든 테이블에 아무 권한이 없어서, 웹에서 직접 읽을 때 403(permission denied)이 남
--    (함수(RPC)로 읽는 건 함수 권한으로 동작해서 괜찮음 -> 홈이 일부만 실패한 이유)
--
--  안전한가
--    권한(GRANT)은 "테이블에 접근할 수 있나", RLS 정책은 "어떤 행을 볼 수 있나"
--    -> B 파트 SQL의 RLS 정책(내 것만 · 친구/팸만)이 그대로 걸러 줌
--    -> 로그인 안 한 사용자(anon)에게는 주지 않음
--    -> 친구 · 팸 · 낙상 알림은 여전히 함수로만 바꿀 수 있음 (쓰기 권한 안 줌)
--
--  B 파트 SQL → A 파트 SQL 두 개 다음에 실행. 여러 번 실행해도 안전.
-- =============================================================

grant usage on schema public to authenticated;

-- 읽기: 웹이 직접 select 하거나 실시간 구독하는 테이블
grant select on
  public.profiles,
  public.daily_steps,
  public.safety_settings,
  public.friendships,
  public.fams,
  public.fam_members,
  public.emergency_alerts,
  public.alert_recipients
to authenticated;
grant select on public.my_friends to authenticated;  -- 친구 목록 뷰 (security_invoker 라 위 테이블 권한 + RLS 로 걸러짐)

-- 쓰기: 웹이 직접 저장하는 곳만
--   safety_settings  위험 감지 설정 저장 (upsert = insert + update). RLS: 내 행만
grant insert, update on public.safety_settings to authenticated;
--   fams             팸 이름 · 색 · 인원 (B 파트 SQL에 이미 있음. RLS: 방장만)
grant update (name, color, max_members) on public.fams to authenticated;
