// DB(supabase/migrations)와 1:1로 맞춘 타입

export type Profile = {
  id: string;
  nickname: string;
  friend_code: string;
  handle: string | null;
  tags: string[];
};

export type FriendStatus = "pending" | "accepted";
export type FriendSource = "code" | "search" | "nfc" | "keyring";

export type Friend = {
  friendship_id: string;
  status: FriendStatus;
  source: FriendSource;
  meet_count: number;
  created_at: string;
  accepted_at: string | null;
  is_outgoing: boolean;
  is_favorite: boolean;
  friend_id: string;
  nickname: string;
  friend_code: string;
  handle: string | null;
  tags: string[];
};

export type FamColor = "purple" | "teal" | "coral" | "periwinkle";

export type Fam = {
  id: string;
  name: string;
  color: FamColor;
  owner_id: string;
  invite_code: string; // 4자리, 화면에는 PAIRY-XXXX
  invite_expires_at: string;
  max_members: number;
  created_at: string;
};

export type MiniMember = { user_id: string; nickname: string };

export type FamSummary = Fam & { member_count: number; today_steps: number; members: MiniMember[] };

export type FamMember = {
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  nickname: string;
};

export type FamStats = { today_steps: number; meet_total: number; alert_user_ids: string[] };

export type FamPreview = {
  fam_id: string;
  name: string;
  color: FamColor;
  member_count: number;
  max_members: number;
  expired: boolean;
  already_member: boolean;
  members: MiniMember[];
};

export type Sensitivity = "low" | "normal" | "high";

export type SafetySettings = {
  user_id: string;
  fall_detection_enabled: boolean;
  fall_sensitivity: Sensitivity;
  wait_seconds: number;
  notify_fams: boolean;
  notify_friends: boolean;
  geofence_enabled: boolean;
  inactivity_alert_enabled: boolean;
};

export type AlertStatus = "countdown" | "cancelled" | "sent" | "resolved";
export type ResponseStatus = "waiting" | "seen" | "calling" | "on_the_way";
export type RecipientStatus = "delivered" | "seen" | "calling" | "on_the_way";
export type AlertSource = "keyring" | "manual" | "test";
export type AlertKind = "fall" | "sos";
export type SendReason = "timeout" | "manual" | "auto";

/** 낙상 알림에 붙는 위치 (넘어진 사람 폰의 GPS) */
export type AlertLocation = {
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  address: string | null;
  location_updated_at: string | null;
};

export type EmergencyAlert = AlertLocation & {
  id: string;
  user_id: string;
  kind: AlertKind;
  trigger_source: AlertSource;
  status: AlertStatus;
  countdown_seconds: number;
  send_reason: SendReason | null;
  auto_sent: boolean;
  started_at: string;
  sent_at: string | null;
  cancelled_at: string | null;
  resolved_at: string | null;
  response_status: ResponseStatus;
  responder_id: string | null;
  responded_at: string | null;
  notified_count: number;
};

export type AlertDetail = AlertLocation & {
  id: string;
  user_id: string;
  nickname: string;
  kind: AlertKind;
  trigger_source: AlertSource;
  status: AlertStatus;
  countdown_seconds: number;
  send_reason: SendReason | null;
  auto_sent: boolean;
  started_at: string;
  sent_at: string | null;
  cancelled_at: string | null;
  resolved_at: string | null;
  response_status: ResponseStatus;
  responder_id: string | null;
  responder_nickname: string | null;
  responded_at: string | null;
  notified_count: number;
  my_status: RecipientStatus | null;
  is_mine: boolean;
};

export type AlertRecipient = { user_id: string; nickname: string; status: RecipientStatus; updated_at: string };

export type DeviceStatus = "connected" | "disconnected" | "unknown";

/** 키링 (devices 테이블. 비밀키 해시는 웹에서 못 읽음) */
export type Device = {
  id: string;
  name: string;
  battery: number | null;
  firmware: string | null;
  meet_count: number;
  last_seen_at: string | null;
  created_at: string;
};

/** 키링 등록/재발급 때 딱 한 번만 받는 값 -> 펌웨어 secrets.h 에 넣음 */
export type DeviceSecret = { device_id: string; secret: string };

/** 키링이 이 시간 안에 보고했으면 "연결됨" (펌웨어는 10초마다 보고) */
export const DEVICE_ONLINE_MS = 45_000;

export function deviceStatus(d: Pick<Device, "last_seen_at"> | null | undefined, now = Date.now()): DeviceStatus {
  if (!d) return "unknown";
  if (!d.last_seen_at) return "disconnected";
  return now - new Date(d.last_seen_at).getTime() < DEVICE_ONLINE_MS ? "connected" : "disconnected";
}

/** 걸음 수: 오늘(실시간) + 목표 + 최근 7일 */
export type StepsData = {
  today: number;
  goal: number;
  updatedAt: string | null;
  week: { day: string; steps: number }[];
};

export type HomeData = {
  me: Profile;
  stepsToday: number;
  stepGoal: number;
  safety: SafetySettings;
  /** 내가 넘어지면 알림을 받을 사람 수 */
  recipientCount: number;
  fams: FamSummary[];
  incomingAlerts: AlertDetail[];
  myActiveAlert: EmergencyAlert | null;
  device: DeviceStatus;
};
