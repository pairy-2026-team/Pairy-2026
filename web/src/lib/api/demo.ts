// =============================================================
//  데모 모드: Supabase 없이 화면/상태 흐름을 확인·시연하기 위한 가짜 백엔드
//  - 데이터는 브라우저 localStorage에 저장
//  - DB 함수(supabase/migrations)와 같은 규칙·같은 에러 코드를 쓴다
// =============================================================
import { ApiError } from "@/lib/errors";
import { kstDate, lastNDays } from "@/lib/date";
import { normalizeFamCode } from "@/lib/format";
import type {
  AlertDetail,
  AlertRecipient,
  EmergencyAlert,
  Fam,
  FamSummary,
  Friend,
  Profile,
  RecipientStatus,
  SafetySettings,
} from "@/lib/types";
import type { PairyApi } from "./types";

const NO_LOC = { latitude: null, longitude: null, accuracy_m: null, address: null, location_updated_at: null };

const KEY = "pairy-demo-v3";
const ME = "u-haeun";

type DemoFriendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  source: Friend["source"];
  requester_favorite: boolean;
  addressee_favorite: boolean;
  meet_count: number;
  created_at: string;
  accepted_at: string | null;
};

type State = {
  profiles: Profile[];
  friendships: DemoFriendship[];
  fams: Fam[];
  members: { fam_id: string; user_id: string; role: "owner" | "member"; joined_at: string }[];
  safety: SafetySettings;
  alerts: EmergencyAlert[];
  recipients: { alert_id: string; user_id: string; status: RecipientStatus; updated_at: string }[];
  steps: Record<string, number>; // `${user}|${day}`
  stepGoal: number;
  stepsUpdatedAt: string | null;
};

const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86400000;
const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const code = (n: number) =>
  Array.from({ length: n }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

function seed(): State {
  const p = (pid: string, nickname: string, handle: string, tags: string[], fc: string) => ({
    id: pid,
    nickname,
    handle,
    tags,
    friend_code: fc,
  });
  const profiles = [
    p(ME, "하은", "haeun.dsn", ["디자인", "사진", "러닝", "ENFP"], "HAEUN1"),
    p("u-jiwoo", "지우", "jiwoo.run", ["러닝", "ENTP"], "JIWOO2"),
    p("u-minjae", "민재", "minjae.pic", ["사진", "INFP"], "MINJA3"),
    p("u-seoyeon", "서연", "seoyeon.d", ["디자인", "ISFJ"], "SEOYE4"),
    p("u-doyoon", "도윤", "doyoon", ["음악", "ENFJ"], "DOYUN5"),
    p("u-harin", "하린", "harin.cook", ["요리", "ESFP"], "HARIN6"),
    p("u-teo", "태오", "teo.dev", ["개발", "INTJ"], "TEOOO7"),
    p("u-sua", "수아", "sua.film", ["필름", "러닝", "INFJ"], "SUAAA8"),
    p("u-yuna", "유나", "yuna.art", ["그림", "ISTP"], "YUNAA9"),
  ];
  let t = 0;
  const fr = (other: string, meet: number, extra: Partial<DemoFriendship> = {}): DemoFriendship => ({
    id: id(),
    requester_id: ME,
    addressee_id: other,
    status: "accepted",
    source: "nfc",
    requester_favorite: false,
    addressee_favorite: false,
    meet_count: meet,
    created_at: iso(10 * DAY - t++ * 3600000),
    accepted_at: iso(10 * DAY - t * 3600000),
    ...extra,
  });
  const run: Fam = {
    id: "fam-run",
    name: "주말 러닝팸",
    color: "purple",
    owner_id: ME,
    invite_code: "7K2Q",
    invite_expires_at: iso(-6 * DAY),
    max_members: 20,
    created_at: "2026-11-23T03:00:00.000Z",
  };
  const today = kstDate();
  const steps: Record<string, number> = {};
  [
    [ME, 3482],
    ["u-jiwoo", 4210],
    ["u-minjae", 2350],
    ["u-seoyeon", 1580],
    ["u-doyoon", 1218],
  ].forEach(([u, s]) => (steps[`${u}|${today}`] = s as number));
  // 지난 6일 내 걸음 (주간 그래프)
  [6120, 4380, 7450, 5210, 2980, 8030].forEach((v, i) => (steps[`${ME}|${lastNDays(7)[i]}`] = v));
  // 기록 화면용: 지난 알림 2건 (취소 1, 종료 1)
  const past = (daysAgo: number, extra: Partial<EmergencyAlert>): EmergencyAlert => ({
    id: id(),
    user_id: ME,
    kind: "fall",
    trigger_source: "keyring",
    status: "cancelled",
    countdown_seconds: 10,
    send_reason: null,
    auto_sent: false,
    started_at: iso(daysAgo * DAY),
    sent_at: null,
    cancelled_at: iso(daysAgo * DAY - 4000),
    resolved_at: null,
    response_status: "waiting",
    responder_id: null,
    responded_at: null,
    notified_count: 0,
    ...NO_LOC,
    ...extra,
  });
  const pastAlerts = [
    past(1.2, {}),
    past(3.4, {
      status: "resolved",
      sent_at: iso(3.4 * DAY - 10000),
      send_reason: "timeout",
      cancelled_at: null,
      resolved_at: iso(3.4 * DAY - 600000),
      response_status: "calling",
      responder_id: "u-minjae",
      responded_at: iso(3.4 * DAY - 40000),
      notified_count: 4,
      latitude: 37.5512,
      longitude: 126.9882,
      accuracy_m: 18,
      address: "서울 중구 남산공원길 105",
      location_updated_at: iso(3.4 * DAY - 9000),
    }),
  ];
  return {
    profiles,
    friendships: [
      fr("u-jiwoo", 3, { requester_favorite: true }),
      fr("u-minjae", 2),
      fr("u-seoyeon", 1),
      fr("u-doyoon", 1),
      fr("u-harin", 2),
      fr("u-teo", 1),
      fr("u-sua", 0, { source: "code", created_at: iso(DAY), accepted_at: iso(DAY) }),
      {
        ...fr("u-yuna", 0),
        requester_id: "u-yuna",
        addressee_id: ME,
        status: "pending",
        source: "code",
        accepted_at: null,
        created_at: iso(3600000),
      },
    ],
    fams: [run],
    members: [ME, "u-jiwoo", "u-minjae", "u-seoyeon", "u-doyoon"].map((u, i) => ({
      fam_id: run.id,
      user_id: u,
      role: i === 0 ? "owner" : "member",
      joined_at: iso(DAY - i * 60000),
    })),
    safety: {
      user_id: ME,
      fall_detection_enabled: true,
      fall_sensitivity: "normal",
      wait_seconds: 10,
      notify_fams: true,
      notify_friends: false,
      geofence_enabled: true,
      inactivity_alert_enabled: false,
    },
    alerts: pastAlerts,
    recipients: ["u-jiwoo", "u-minjae", "u-seoyeon", "u-doyoon"].map((u, i) => ({
      alert_id: pastAlerts[1].id,
      user_id: u,
      status: (i === 1 ? "calling" : i === 0 ? "seen" : "delivered") as RecipientStatus,
      updated_at: iso(3.4 * DAY - 40000),
    })),
    steps,
    stepGoal: 5000,
    stepsUpdatedAt: iso(60000),
  };
}

let mem: State | null = null;
function load(): State {
  if (mem) return mem;
  if (typeof window === "undefined") return (mem = seed());
  try {
    const raw = localStorage.getItem(KEY);
    mem = raw ? (JSON.parse(raw) as State) : seed();
  } catch {
    mem = seed();
  }
  return mem;
}

const listeners = new Set<(alertId: string) => void>();

// ---- 데모: 키링을 차고 걷는 것처럼 오늘 걸음 수를 조금씩 올림 (실시간 표시 확인용) ----
const stepListeners = new Set<(steps: number, updatedAt: string) => void>();
let walkTimer: ReturnType<typeof setInterval> | null = null;
function startWalking() {
  if (walkTimer || typeof window === "undefined") return;
  walkTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const s = load();
    const k = `${ME}|${kstDate()}`;
    s.steps[k] = (s.steps[k] ?? 0) + 1 + Math.floor(Math.random() * 4);
    s.stepsUpdatedAt = iso();
    save();
    stepListeners.forEach((l) => l(s.steps[k], s.stepsUpdatedAt!));
  }, 1600);
}
function stopWalking() {
  if (walkTimer) clearInterval(walkTimer);
  walkTimer = null;
}
function save(changedAlertId?: string) {
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(mem));
  if (changedAlertId) listeners.forEach((l) => l(changedAlertId));
}

const delay = <T>(v: T, ms = 150) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const prof = (uid: string) => load().profiles.find((p) => p.id === uid)!;
const pub = (p: Profile): Profile => ({
  id: p.id,
  nickname: p.nickname,
  friend_code: p.friend_code,
  handle: p.handle,
  tags: p.tags,
});
const RANK: Record<string, number> = { waiting: 0, delivered: 0, seen: 1, calling: 2, on_the_way: 3 };

const samePair = (f: DemoFriendship, a: string, b: string) =>
  [f.requester_id, f.addressee_id].sort().join() === [a, b].sort().join();
const areFriends = (a: string, b: string) =>
  load().friendships.some((f) => f.status === "accepted" && samePair(f, a, b));

function recipientIds(owner: string) {
  const s = load();
  const set = new Set<string>();
  if (s.safety.notify_fams) {
    const myFams = s.members.filter((m) => m.user_id === owner).map((m) => m.fam_id);
    s.members.filter((m) => myFams.includes(m.fam_id) && m.user_id !== owner).forEach((m) => set.add(m.user_id));
  }
  if (s.safety.notify_friends) s.profiles.forEach((p) => p.id !== owner && areFriends(owner, p.id) && set.add(p.id));
  return [...set];
}

/**
 * 데모에서는 내 알림에 대한 팸 응답을 시간으로 흉내 낸다.
 * 전송 4초 뒤 첫 번째 멤버 "확인했어요", 9초 뒤 두 번째 멤버 "전화 거는 중".
 */
function simulated(a: EmergencyAlert) {
  const s = load();
  const rows = s.recipients.filter((r) => r.alert_id === a.id);
  if (a.user_id !== ME || a.status !== "sent" || !a.sent_at) return rows;
  const el = Date.now() - new Date(a.sent_at).getTime();
  const at = (ms: number) => new Date(new Date(a.sent_at!).getTime() + ms).toISOString();
  return rows.map((r, i) => {
    let st: RecipientStatus = r.status;
    let up = r.updated_at;
    if (i === 0 && el > 4000 && RANK[st] < 1) [st, up] = ["seen", at(4000)];
    if (i === 1 && el > 9000 && RANK[st] < 2) [st, up] = ["calling", at(9000)];
    return { ...r, status: st, updated_at: up };
  });
}

function withSummary(a: EmergencyAlert): EmergencyAlert {
  const rows = simulated(a);
  const best = [...rows].sort((x, y) => RANK[y.status] - RANK[x.status] || x.updated_at.localeCompare(y.updated_at))[0];
  if (!best || RANK[best.status] === 0) return a;
  return {
    ...a,
    response_status: best.status as EmergencyAlert["response_status"],
    responder_id: best.user_id,
    responded_at: best.updated_at,
  };
}

function detail(a0: EmergencyAlert): AlertDetail {
  const a = withSummary(a0);
  const p = prof(a.user_id);
  return {
    id: a.id,
    user_id: a.user_id,
    nickname: p.nickname,
    kind: a.kind,
    trigger_source: a.trigger_source,
    status: a.status,
    countdown_seconds: a.countdown_seconds,
    send_reason: a.send_reason,
    auto_sent: a.auto_sent,
    started_at: a.started_at,
    sent_at: a.sent_at,
    cancelled_at: a.cancelled_at,
    resolved_at: a.resolved_at,
    response_status: a.response_status,
    responder_id: a.responder_id,
    latitude: a.latitude,
    longitude: a.longitude,
    accuracy_m: a.accuracy_m,
    address: a.address,
    location_updated_at: a.location_updated_at,
    responder_nickname: a.responder_id ? prof(a.responder_id).nickname : null,
    responded_at: a.responded_at,
    notified_count: a.notified_count,
    my_status: load().recipients.find((r) => r.alert_id === a.id && r.user_id === ME)?.status ?? null,
    is_mine: a.user_id === ME,
  };
}

function myFriends(): Friend[] {
  return load()
    .friendships.filter((f) => f.requester_id === ME || f.addressee_id === ME)
    .map((f) => {
      const out = f.requester_id === ME;
      const p = prof(out ? f.addressee_id : f.requester_id);
      return {
        friendship_id: f.id,
        status: f.status,
        source: f.source,
        meet_count: f.meet_count,
        created_at: f.created_at,
        accepted_at: f.accepted_at,
        is_outgoing: out,
        is_favorite: out ? f.requester_favorite : f.addressee_favorite,
        friend_id: p.id,
        nickname: p.nickname,
        friend_code: p.friend_code,
        handle: p.handle,
        tags: p.tags,
      };
    });
}

function famSummary(f: Fam): FamSummary {
  const s = load();
  const ms = s.members.filter((m) => m.fam_id === f.id).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  return {
    ...f,
    member_count: ms.length,
    today_steps: ms.reduce((sum, m) => sum + (s.steps[`${m.user_id}|${kstDate()}`] ?? 0), 0),
    members: ms.map((m) => ({ user_id: m.user_id, nickname: prof(m.user_id).nickname })),
  };
}

function getAlertOrThrow(alertId: string) {
  const a = load().alerts.find((x) => x.id === alertId && x.user_id === ME);
  if (!a) throw new ApiError("ALERT_NOT_FOUND");
  return a;
}

function markSent(a: EmergencyAlert, reason: "timeout" | "manual" | "auto") {
  const s = load();
  a.status = "sent";
  a.sent_at = iso();
  a.send_reason = reason;
  a.auto_sent = reason === "auto";
  const ids = recipientIds(a.user_id);
  ids.forEach((u) => s.recipients.push({ alert_id: a.id, user_id: u, status: "delivered", updated_at: iso() }));
  a.notified_count = ids.length;
}

export const demoApi: PairyApi & { simulateIncoming(): Promise<string>; reset(): void } = {
  mode: "demo",

  async getMe() {
    return delay(pub(prof(ME)));
  },

  async getHome() {
    const s = load();
    const my = s.alerts
      .filter((a) => a.user_id === ME && (a.status === "countdown" || a.status === "sent"))
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
    return delay({
      me: pub(prof(ME)),
      stepsToday: s.steps[`${ME}|${kstDate()}`] ?? 0,
      stepGoal: s.stepGoal,
      safety: { ...s.safety },
      recipientCount: recipientIds(ME).length,
      fams: await this.listMyFams(),
      incomingAlerts: await this.listIncomingAlerts(),
      myActiveAlert: my ? withSummary(my) : null,
      device: "connected" as const,
    });
  },

  // ---------------- 걸음 수 ----------------
  async getSteps() {
    const s = load();
    const days = lastNDays(7);
    return delay({
      today: s.steps[`${ME}|${days[6]}`] ?? 0,
      goal: s.stepGoal,
      updatedAt: s.stepsUpdatedAt,
      week: days.map((day) => ({ day, steps: s.steps[`${ME}|${day}`] ?? 0 })),
    });
  },

  async setStepGoal(goal) {
    const g = Math.round(goal);
    if (!(g >= 1000 && g <= 50000)) throw new ApiError("INVALID_STEP_GOAL");
    load().stepGoal = g;
    save();
    return delay(g, 250);
  },

  subscribeSteps(onSteps) {
    stepListeners.add(onSteps);
    startWalking();
    return () => {
      stepListeners.delete(onSteps);
      if (!stepListeners.size) stopWalking();
    };
  },

  // ---------------- 친구 ----------------
  async listFriends() {
    return delay(myFriends());
  },

  async searchProfiles(query) {
    const q = query.trim().replace(/^[@#]/, "").toLowerCase();
    if (!q) return [];
    return delay(
      load()
        .profiles.filter(
          (p) =>
            p.id !== ME &&
            (p.nickname.toLowerCase().includes(q) ||
              (p.handle ?? "").toLowerCase().includes(q) ||
              p.friend_code === q.toUpperCase()),
        )
        .map(pub),
    );
  },

  async sendFriendRequest(friendCode, source = "code") {
    const s = load();
    const target = s.profiles.find((p) => p.friend_code === friendCode.trim().toUpperCase());
    if (!target) throw new ApiError("FRIEND_CODE_NOT_FOUND");
    if (target.id === ME) throw new ApiError("CANNOT_ADD_SELF");
    const direct = source === "nfc" || source === "keyring";
    const ex = s.friendships.find((f) => samePair(f, ME, target.id));
    if (ex) {
      if (ex.status === "accepted") {
        if (direct) ex.meet_count += 1;
      } else if (ex.addressee_id === ME) {
        ex.status = "accepted";
        ex.accepted_at = iso();
      } else throw new ApiError("REQUEST_ALREADY_SENT");
      save();
      return delay({ status: ex.status });
    }
    const f: DemoFriendship = {
      id: id(),
      requester_id: ME,
      addressee_id: target.id,
      status: direct ? "accepted" : "pending",
      source,
      requester_favorite: false,
      addressee_favorite: false,
      meet_count: direct ? 1 : 0,
      created_at: iso(),
      accepted_at: direct ? iso() : null,
    };
    s.friendships.push(f);
    save();
    return delay({ status: f.status });
  },

  async respondFriendRequest(friendshipId, accept) {
    const s = load();
    const f = s.friendships.find((x) => x.id === friendshipId && x.addressee_id === ME);
    if (!f) throw new ApiError("REQUEST_NOT_FOUND");
    if (f.status !== "pending") throw new ApiError("REQUEST_ALREADY_HANDLED");
    if (accept) {
      f.status = "accepted";
      f.accepted_at = iso();
    } else s.friendships = s.friendships.filter((x) => x.id !== f.id);
    save();
    await delay(null);
  },

  async toggleFavorite(friendshipId) {
    const f = load().friendships.find((x) => x.id === friendshipId && x.status === "accepted");
    if (!f) throw new ApiError("FRIEND_NOT_FOUND");
    let v: boolean;
    if (f.requester_id === ME) v = f.requester_favorite = !f.requester_favorite;
    else v = f.addressee_favorite = !f.addressee_favorite;
    save();
    return delay(v, 60);
  },

  async removeFriend(friendshipId) {
    const s = load();
    const before = s.friendships.length;
    s.friendships = s.friendships.filter(
      (f) => !(f.id === friendshipId && (f.requester_id === ME || f.addressee_id === ME)),
    );
    if (s.friendships.length === before) throw new ApiError("FRIEND_NOT_FOUND");
    save();
    await delay(null);
  },

  // ---------------- 팸 ----------------
  async listMyFams() {
    const s = load();
    return delay(
      s.fams
        .filter((f) => s.members.some((m) => m.fam_id === f.id && m.user_id === ME))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(famSummary),
      40,
    );
  },

  async createFam({ name, color, memberIds }) {
    const s = load();
    if (!name.trim()) throw new ApiError("FAM_NAME_REQUIRED");
    if (s.members.filter((m) => m.user_id === ME).length >= 10) throw new ApiError("TOO_MANY_FAMS");
    if (memberIds.length + 1 > 20) throw new ApiError("FAM_FULL");
    const f: Fam = {
      id: id(),
      name: name.trim(),
      color,
      owner_id: ME,
      invite_code: code(4),
      invite_expires_at: iso(-7 * DAY),
      max_members: 20,
      created_at: iso(),
    };
    s.fams.unshift(f);
    s.members.push({ fam_id: f.id, user_id: ME, role: "owner", joined_at: iso() });
    memberIds
      .filter((u) => u !== ME && areFriends(ME, u))
      .forEach((u, i) => s.members.push({ fam_id: f.id, user_id: u, role: "member", joined_at: iso(-i - 1) }));
    save();
    return delay(f, 300);
  },

  async getFam(famId) {
    const s = load();
    const fam = s.fams.find((f) => f.id === famId);
    if (!fam || !s.members.some((m) => m.fam_id === famId && m.user_id === ME)) throw new ApiError("FAM_NOT_FOUND");
    const ms = s.members.filter((m) => m.fam_id === famId).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
    const ids = ms.map((m) => m.user_id);
    return delay({
      fam,
      members: ms.map((m) => ({ ...m, nickname: prof(m.user_id).nickname })),
      stats: {
        today_steps: famSummary(fam).today_steps,
        meet_total: s.friendships
          .filter((f) => ids.includes(f.requester_id) && ids.includes(f.addressee_id))
          .reduce((n, f) => n + f.meet_count, 0),
        alert_user_ids: [
          ...new Set(
            s.alerts.filter((a) => ["countdown", "sent"].includes(a.status) && ids.includes(a.user_id)).map((a) => a.user_id),
          ),
        ],
      },
    });
  },

  async previewFam(c) {
    const s = load();
    const f = s.fams.find((x) => x.invite_code === normalizeFamCode(c));
    if (!f) return delay(null);
    const sum = famSummary(f);
    return delay({
      fam_id: f.id,
      name: f.name,
      color: f.color,
      member_count: sum.member_count,
      max_members: f.max_members,
      expired: new Date(f.invite_expires_at) < new Date(),
      already_member: s.members.some((m) => m.fam_id === f.id && m.user_id === ME),
      members: sum.members,
    });
  },

  async joinFam(c) {
    const s = load();
    const f = s.fams.find((x) => x.invite_code === normalizeFamCode(c));
    if (!f) throw new ApiError("INVITE_CODE_NOT_FOUND");
    if (s.members.some((m) => m.fam_id === f.id && m.user_id === ME)) return delay(f.id);
    if (new Date(f.invite_expires_at) < new Date()) throw new ApiError("INVITE_CODE_EXPIRED");
    if (s.members.filter((m) => m.fam_id === f.id).length >= f.max_members) throw new ApiError("FAM_FULL");
    s.members.push({ fam_id: f.id, user_id: ME, role: "member", joined_at: iso() });
    save();
    return delay(f.id);
  },

  async regenerateFamCode(famId) {
    const f = load().fams.find((x) => x.id === famId);
    if (!f || f.owner_id !== ME) throw new ApiError("NOT_FAM_OWNER");
    f.invite_code = code(4);
    f.invite_expires_at = iso(-7 * DAY);
    save();
    return delay(f);
  },

  async leaveFam(famId) {
    const s = load();
    const f = s.fams.find((x) => x.id === famId);
    if (!f) throw new ApiError("FAM_NOT_FOUND");
    s.members = s.members.filter((m) => !(m.fam_id === famId && m.user_id === ME));
    if (f.owner_id === ME) {
      const next = s.members.filter((m) => m.fam_id === famId).sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0];
      if (!next) s.fams = s.fams.filter((x) => x.id !== famId);
      else {
        f.owner_id = next.user_id;
        next.role = "owner";
      }
    }
    save();
    await delay(null);
  },

  async kickFamMember(famId, userId) {
    const s = load();
    const f = s.fams.find((x) => x.id === famId);
    if (!f || f.owner_id !== ME) throw new ApiError("NOT_FAM_OWNER");
    if (userId === ME) throw new ApiError("USE_LEAVE_INSTEAD");
    s.members = s.members.filter((m) => !(m.fam_id === famId && m.user_id === userId));
    save();
    await delay(null);
  },

  // ---------------- 안전 설정 ----------------
  async getSafety() {
    return delay({ ...load().safety });
  },

  async saveSafety(patch) {
    const s = load();
    if (patch.wait_seconds !== undefined && (patch.wait_seconds < 5 || patch.wait_seconds > 60))
      throw new ApiError("UNKNOWN", "대기 시간은 5~60초 사이여야 해요.");
    s.safety = { ...s.safety, ...patch };
    save();
    return delay({ ...s.safety }, 350);
  },

  // ---------------- 낙상 / SOS ----------------
  async startFall(source, kind = "fall") {
    const s = load();
    const running = s.alerts.find(
      (a) =>
        a.user_id === ME &&
        a.status === "countdown" &&
        Date.now() - new Date(a.started_at).getTime() < (a.countdown_seconds + 30) * 1000,
    );
    if (running) return delay(running);
    if (kind === "fall" && !s.safety.fall_detection_enabled) throw new ApiError("FALL_DETECTION_DISABLED");
    const a: EmergencyAlert = {
      id: id(),
      user_id: ME,
      kind,
      trigger_source: source,
      status: "countdown",
      countdown_seconds: kind === "sos" ? 0 : s.safety.wait_seconds,
      send_reason: null,
      auto_sent: false,
      started_at: iso(),
      sent_at: null,
      cancelled_at: null,
      resolved_at: null,
      response_status: "waiting",
      responder_id: null,
      responded_at: null,
      notified_count: 0,
      ...NO_LOC,
    };
    s.alerts.push(a);
    save(a.id);
    return delay(a);
  },

  async getMyAlert(alertId) {
    const a = load().alerts.find((x) => x.id === alertId && x.user_id === ME);
    return delay(a ? withSummary(a) : null, 60);
  },

  async cancelFall(alertId) {
    const a = getAlertOrThrow(alertId);
    if (a.status === "cancelled") return delay(a);
    if (a.status !== "countdown") throw new ApiError("ALERT_ALREADY_SENT");
    a.status = "cancelled";
    a.cancelled_at = iso();
    save(a.id);
    return delay(a);
  },

  async sendFall(alertId, reason) {
    const a = getAlertOrThrow(alertId);
    if (a.status === "sent") return delay(a);
    if (a.status !== "countdown") throw new ApiError("ALERT_NOT_ACTIVE");
    markSent(a, reason);
    save(a.id);
    [4500, 9500].forEach((ms) => setTimeout(() => listeners.forEach((l) => l(a.id)), ms));
    return delay(a, 400);
  },

  async resolveFall(alertId) {
    const s = load();
    const a = s.alerts.find((x) => x.id === alertId);
    if (!a) throw new ApiError("ALERT_NOT_FOUND");
    const mine = s.recipients.find((r) => r.alert_id === a.id && r.user_id === ME);
    if (a.user_id !== ME && (!mine || mine.status === "delivered")) throw new ApiError("ALERT_NOT_FOUND");
    if (a.status === "resolved") return delay(a);
    if (a.status !== "sent") throw new ApiError("ALERT_NOT_ACTIVE");
    // 시뮬레이션된 응답을 실제 값으로 고정
    simulated(a).forEach((r) => {
      const row = s.recipients.find((x) => x.alert_id === r.alert_id && x.user_id === r.user_id);
      if (row) Object.assign(row, r);
    });
    Object.assign(a, withSummary(a), { status: "resolved", resolved_at: iso() });
    save(a.id);
    return delay(a);
  },

  async respondFall(alertId, response) {
    const s = load();
    const a = s.alerts.find((x) => x.id === alertId);
    const r = s.recipients.find((x) => x.alert_id === alertId && x.user_id === ME);
    if (!a || !r) throw new ApiError("ALERT_NOT_FOUND");
    if (a.status !== "sent") throw new ApiError("ALERT_NOT_ACTIVE");
    if (!(response === "seen" && RANK[r.status] > 1)) {
      r.status = response;
      r.updated_at = iso();
    }
    if (RANK[response] >= RANK[a.response_status]) {
      a.response_status = response;
      a.responder_id = ME;
      a.responded_at = iso();
    }
    save(a.id);
    await delay(null);
  },

  async getAlertDetail(alertId) {
    const s = load();
    const a = s.alerts.find((x) => x.id === alertId);
    if (!a) return delay(null);
    if (a.user_id !== ME && !s.recipients.some((r) => r.alert_id === a.id && r.user_id === ME)) return delay(null);
    return delay(detail(a), 60);
  },

  async getAlertRecipients(alertId) {
    const a = load().alerts.find((x) => x.id === alertId);
    if (!a) return delay([]);
    const rows: AlertRecipient[] = simulated(a).map((r) => ({
      user_id: r.user_id,
      nickname: prof(r.user_id).nickname,
      status: r.status,
      updated_at: r.updated_at,
    }));
    return delay(rows.sort((x, y) => RANK[y.status] - RANK[x.status]), 60);
  },

  async listIncomingAlerts() {
    const s = load();
    return s.alerts
      .filter((a) => a.user_id !== ME && a.status === "sent" && s.recipients.some((r) => r.alert_id === a.id && r.user_id === ME))
      .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))
      .map(detail);
  },

  async listAlertHistory(limit = 30) {
    const s = load();
    return delay(
      s.alerts
        .filter((a) => a.user_id === ME || s.recipients.some((r) => r.alert_id === a.id && r.user_id === ME))
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .slice(0, limit)
        .map(detail),
      80,
    );
  },

  async updateAlertLocation(alertId, loc) {
    const a = getAlertOrThrow(alertId);
    if (a.status !== "countdown" && a.status !== "sent") return delay(a);
    Object.assign(a, {
      latitude: loc.lat,
      longitude: loc.lng,
      accuracy_m: loc.accuracy ?? null,
      address: loc.address?.trim() || a.address,
      location_updated_at: iso(),
    });
    save(a.id);
    return delay(a, 60);
  },

  async getRecipientCount() {
    return delay(recipientIds(ME).length, 40);
  },

  subscribeAlerts(onChange) {
    listeners.add(onChange);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        mem = null;
        onChange("*");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  },

  /** 시연용: 팸 멤버(지우)가 넘어져서 10초간 응답이 없었던 상황 */
  async simulateIncoming() {
    const s = load();
    const victim = "u-jiwoo";
    const a: EmergencyAlert = {
      id: id(),
      user_id: victim,
      kind: "fall",
      trigger_source: "keyring",
      status: "sent",
      countdown_seconds: 10,
      send_reason: "timeout",
      auto_sent: false,
      started_at: iso(62000),
      sent_at: iso(52000),
      cancelled_at: null,
      resolved_at: null,
      response_status: "waiting",
      responder_id: null,
      responded_at: null,
      notified_count: 4,
      latitude: 37.5568,
      longitude: 126.9038,
      accuracy_m: 15,
      address: "서울 마포구 월드컵로 212",
      location_updated_at: iso(50000),
    };
    s.alerts.push(a);
    [ME, "u-minjae", "u-seoyeon", "u-doyoon"].forEach((u) =>
      s.recipients.push({ alert_id: a.id, user_id: u, status: "delivered", updated_at: iso(52000) }),
    );
    save(a.id);
    return delay(a.id);
  },

  reset() {
    mem = seed();
    save("*");
  },
};
