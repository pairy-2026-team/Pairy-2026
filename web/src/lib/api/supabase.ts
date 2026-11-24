import type { PostgrestError } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { ApiError, toApiError } from "@/lib/errors";
import { kstDate, lastNDays } from "@/lib/date";
import type {
  AlertDetail,
  AlertRecipient,
  EmergencyAlert,
  Fam,
  FamMember,
  FamPreview,
  FamStats,
  FamSummary,
  Friend,
  Profile,
  SafetySettings,
  StepsData,
} from "@/lib/types";
import type { PairyApi } from "./types";

const DEFAULT_STEP_GOAL = 5000;
const PROFILE_COLS = "id, nickname, friend_code, handle, tags";

function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw toApiError(res.error);
  return res.data as T;
}

async function uid() {
  const { data } = await getSupabase().auth.getUser();
  if (!data.user) throw new ApiError("NOT_AUTHENTICATED");
  return data.user.id;
}

const normProfile = (p: Profile): Profile => ({ ...p, tags: p.tags ?? [] });

export const supabaseApi: PairyApi = {
  mode: "supabase",

  async getMe() {
    const me = await uid();
    const p = unwrap(await getSupabase().from("profiles").select(PROFILE_COLS).eq("id", me).single()) as Profile;
    return normProfile(p);
  },

  async getHome() {
    const sb = getSupabase();
    const me = await uid();
    const [profile, today, goal, safety, recipientCount, fams, incomingAlerts, myAlert] = await Promise.all([
      this.getMe(),
      sb.from("daily_steps").select("steps").eq("user_id", me).eq("day", kstDate()).maybeSingle().then(unwrap),
      sb.from("profiles").select("step_goal").eq("id", me).single().then(unwrap),
      this.getSafety(),
      this.getRecipientCount(),
      this.listMyFams(),
      this.listIncomingAlerts(),
      sb
        .from("emergency_alerts")
        .select("*")
        .eq("user_id", me)
        .in("status", ["countdown", "sent"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(unwrap),
    ]);
    return {
      me: profile,
      stepsToday: (today as { steps: number } | null)?.steps ?? 0,
      stepGoal: (goal as { step_goal: number | null })?.step_goal ?? DEFAULT_STEP_GOAL,
      safety,
      recipientCount,
      fams,
      incomingAlerts,
      myActiveAlert: (myAlert as EmergencyAlert | null) ?? null,
      // 키링 연결 상태는 기기 연결(12·13) 파트에서 채움
      device: "unknown",
    };
  },

  // ---------------- 걸음 수 ----------------
  async getSteps(): Promise<StepsData> {
    const sb = getSupabase();
    const me = await uid();
    const days = lastNDays(7);
    const [rows, goal] = await Promise.all([
      sb.from("daily_steps").select("day, steps, updated_at").eq("user_id", me).gte("day", days[0]).then(unwrap),
      sb.from("profiles").select("step_goal").eq("id", me).single().then(unwrap),
    ]);
    const byDay = new Map((rows as { day: string; steps: number; updated_at: string }[]).map((r) => [r.day, r]));
    const today = byDay.get(days[6]);
    return {
      today: today?.steps ?? 0,
      goal: (goal as { step_goal: number | null })?.step_goal ?? DEFAULT_STEP_GOAL,
      updatedAt: today?.updated_at ?? null,
      week: days.map((day) => ({ day, steps: byDay.get(day)?.steps ?? 0 })),
    };
  },

  async setStepGoal(goal) {
    return unwrap(await getSupabase().rpc("set_step_goal", { p_goal: Math.round(goal) })) as number;
  },

  subscribeSteps(onSteps) {
    const sb = getSupabase();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let closed = false;
    uid()
      .then((me) => {
        if (closed) return;
        channel = sb
          .channel(`steps-${me}-${Math.random().toString(36).slice(2)}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "daily_steps", filter: `user_id=eq.${me}` },
            (payload) => {
              const row = payload.new as { day?: string; steps?: number; updated_at?: string };
              if (row?.day === kstDate() && typeof row.steps === "number")
                onSteps(row.steps, row.updated_at ?? new Date().toISOString());
            },
          )
          .subscribe();
      })
      .catch(() => {});
    return () => {
      closed = true;
      if (channel) sb.removeChannel(channel);
    };
  },

  // ---------------- 친구 ----------------
  async listFriends() {
    const rows = unwrap(await getSupabase().from("my_friends").select("*").order("nickname")) as Friend[];
    return rows.map((f) => ({ ...f, tags: f.tags ?? [] }));
  },

  async searchProfiles(query) {
    const q = query.trim();
    if (!q) return [];
    const me = await uid();
    const safe = q.replace(/[%_,()@#]/g, "");
    if (!safe) return [];
    const rows = unwrap(
      await getSupabase()
        .from("profiles")
        .select(PROFILE_COLS)
        .or(`nickname.ilike.%${safe}%,handle.ilike.%${safe}%,friend_code.eq.${safe.toUpperCase()}`)
        .neq("id", me)
        .limit(20),
    ) as Profile[];
    return rows.map(normProfile);
  },

  async sendFriendRequest(friendCode, source = "code") {
    const row = unwrap(
      await getSupabase().rpc("send_friend_request", { p_friend_code: friendCode, p_source: source }),
    ) as { status: "pending" | "accepted" };
    return { status: row.status };
  },

  async respondFriendRequest(friendshipId, accept) {
    unwrap(await getSupabase().rpc("respond_friend_request", { p_friendship_id: friendshipId, p_accept: accept }));
  },

  async toggleFavorite(friendshipId) {
    return unwrap(await getSupabase().rpc("toggle_friend_favorite", { p_friendship_id: friendshipId })) as boolean;
  },

  async removeFriend(friendshipId) {
    unwrap(await getSupabase().rpc("remove_friend", { p_friendship_id: friendshipId }));
  },

  // ---------------- 팸 ----------------
  async listMyFams() {
    const rows = unwrap(await getSupabase().rpc("my_fams")) as FamSummary[];
    return rows.map((f) => ({ ...f, members: f.members ?? [] }));
  },

  async createFam(input) {
    return unwrap(
      await getSupabase().rpc("create_fam", {
        p_name: input.name,
        p_color: input.color,
        p_member_ids: input.memberIds,
      }),
    ) as Fam;
  },

  async getFam(famId) {
    const sb = getSupabase();
    const fam = unwrap(await sb.from("fams").select("*").eq("id", famId).maybeSingle()) as Fam | null;
    if (!fam) throw new ApiError("FAM_NOT_FOUND");
    const [rows, statsRows] = await Promise.all([
      sb.from("fam_members").select("user_id, role, joined_at").eq("fam_id", famId).order("joined_at").then(unwrap),
      sb.rpc("fam_stats", { p_fam_id: famId }).then(unwrap),
    ]);
    const memberRows = rows as Omit<FamMember, "nickname">[];
    const profiles = unwrap(
      await sb.from("profiles").select("id, nickname").in("id", memberRows.map((r) => r.user_id)),
    ) as { id: string; nickname: string }[];
    const names = new Map(profiles.map((p) => [p.id, p.nickname]));
    const stats = ((statsRows as FamStats[])[0] ?? { today_steps: 0, meet_total: 0, alert_user_ids: [] }) as FamStats;
    return {
      fam,
      members: memberRows.map((r) => ({ ...r, nickname: names.get(r.user_id) ?? "알 수 없음" })),
      stats: { ...stats, alert_user_ids: stats.alert_user_ids ?? [] },
    };
  },

  async previewFam(code) {
    const rows = unwrap(await getSupabase().rpc("preview_fam_by_code", { p_code: code })) as FamPreview[];
    return rows[0] ? { ...rows[0], members: rows[0].members ?? [] } : null;
  },

  async joinFam(code) {
    return unwrap(await getSupabase().rpc("join_fam_by_code", { p_code: code })) as string;
  },

  async regenerateFamCode(famId) {
    return unwrap(await getSupabase().rpc("regenerate_fam_code", { p_fam_id: famId })) as Fam;
  },

  async leaveFam(famId) {
    unwrap(await getSupabase().rpc("leave_fam", { p_fam_id: famId }));
  },

  async kickFamMember(famId, userId) {
    unwrap(await getSupabase().rpc("kick_fam_member", { p_fam_id: famId, p_user_id: userId }));
  },

  // ---------------- 안전 설정 ----------------
  async getSafety() {
    const sb = getSupabase();
    const me = await uid();
    const row = unwrap(await sb.from("safety_settings").select("*").eq("user_id", me).maybeSingle());
    if (row) return row as SafetySettings;
    // 홈과 설정이 동시에 불러도 겹치지 않게: 이미 있으면 그대로 두고 다시 읽음
    unwrap(await sb.from("safety_settings").upsert({ user_id: me }, { onConflict: "user_id", ignoreDuplicates: true }));
    return unwrap(await sb.from("safety_settings").select("*").eq("user_id", me).single()) as SafetySettings;
  },

  async saveSafety(patch) {
    const me = await uid();
    return unwrap(
      await getSupabase().from("safety_settings").upsert({ user_id: me, ...patch }).select("*").single(),
    ) as SafetySettings;
  },

  // ---------------- 낙상 / SOS ----------------
  async startFall(source, kind = "fall") {
    return unwrap(await getSupabase().rpc("start_fall_alert", { p_source: source, p_kind: kind })) as EmergencyAlert;
  },

  async getMyAlert(alertId) {
    const me = await uid();
    return unwrap(
      await getSupabase().from("emergency_alerts").select("*").eq("id", alertId).eq("user_id", me).maybeSingle(),
    ) as EmergencyAlert | null;
  },

  async cancelFall(alertId) {
    return unwrap(await getSupabase().rpc("cancel_fall_alert", { p_alert_id: alertId })) as EmergencyAlert;
  },

  async sendFall(alertId, reason) {
    return unwrap(
      await getSupabase().rpc("send_fall_alert", { p_alert_id: alertId, p_reason: reason }),
    ) as EmergencyAlert;
  },

  async resolveFall(alertId) {
    return unwrap(await getSupabase().rpc("resolve_fall_alert", { p_alert_id: alertId })) as EmergencyAlert;
  },

  async respondFall(alertId, response) {
    unwrap(await getSupabase().rpc("respond_fall_alert", { p_alert_id: alertId, p_response: response }));
  },

  async getAlertDetail(alertId) {
    const rows = unwrap(await getSupabase().rpc("get_alert_detail", { p_alert_id: alertId })) as AlertDetail[];
    return rows[0] ?? null;
  },

  async getAlertRecipients(alertId) {
    return unwrap(await getSupabase().rpc("get_alert_recipients", { p_alert_id: alertId })) as AlertRecipient[];
  },

  async listIncomingAlerts() {
    const sb = getSupabase();
    const me = await uid();
    const rows = unwrap(
      await sb
        .from("emergency_alerts")
        .select("id")
        .eq("status", "sent")
        .neq("user_id", me)
        .order("sent_at", { ascending: false })
        .limit(5),
    ) as { id: string }[];
    const details = await Promise.all(rows.map((r) => this.getAlertDetail(r.id)));
    return details.filter((d): d is AlertDetail => !!d);
  },

  async listAlertHistory(limit = 30) {
    return unwrap(await getSupabase().rpc("list_alert_history", { p_limit: limit })) as AlertDetail[];
  },

  async updateAlertLocation(alertId, loc) {
    return unwrap(
      await getSupabase().rpc("update_alert_location", {
        p_alert_id: alertId,
        p_lat: loc.lat,
        p_lng: loc.lng,
        p_accuracy: loc.accuracy ?? null,
        p_address: loc.address ?? null,
      }),
    ) as EmergencyAlert;
  },

  async getRecipientCount() {
    return unwrap(await getSupabase().rpc("my_alert_recipient_count")) as number;
  },

  subscribeAlerts(onChange) {
    const sb = getSupabase();
    const channel = sb.channel(`alerts-${Math.random().toString(36).slice(2)}`);
    for (const table of ["emergency_alerts", "alert_recipients"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        const row = (payload.new ?? payload.old) as { id?: string; alert_id?: string };
        const id = row?.alert_id ?? row?.id;
        if (id) onChange(id);
      });
    }
    channel.subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  },
};
