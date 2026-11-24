import type {
  AlertDetail,
  AlertKind,
  AlertRecipient,
  AlertSource,
  EmergencyAlert,
  Fam,
  FamColor,
  FamMember,
  FamPreview,
  FamStats,
  FamSummary,
  Friend,
  FriendSource,
  HomeData,
  Profile,
  RecipientStatus,
  SafetySettings,
  StepsData,
} from "@/lib/types";

export type GeoInput = { lat: number; lng: number; accuracy?: number | null; address?: string | null };

export type CreateFamInput = { name: string; color: FamColor; memberIds: string[] };

/** 화면은 이 인터페이스만 사용한다. (Supabase 구현 / 데모 구현 교체 가능) */
export interface PairyApi {
  mode: "supabase" | "demo";

  getMe(): Promise<Profile>;
  getHome(): Promise<HomeData>;

  // 걸음 수 (키링 -> daily_steps -> 실시간)
  getSteps(): Promise<StepsData>;
  setStepGoal(goal: number): Promise<number>;
  /** 오늘 걸음 수가 바뀔 때마다 호출. 반환값으로 구독 해제 */
  subscribeSteps(onSteps: (steps: number, updatedAt: string) => void): () => void;

  // 친구
  listFriends(): Promise<Friend[]>;
  searchProfiles(query: string): Promise<Profile[]>;
  sendFriendRequest(friendCode: string, source?: FriendSource): Promise<{ status: "pending" | "accepted" }>;
  respondFriendRequest(friendshipId: string, accept: boolean): Promise<void>;
  toggleFavorite(friendshipId: string): Promise<boolean>;
  removeFriend(friendshipId: string): Promise<void>;

  // 팸
  listMyFams(): Promise<FamSummary[]>;
  createFam(input: CreateFamInput): Promise<Fam>;
  getFam(famId: string): Promise<{ fam: Fam; members: FamMember[]; stats: FamStats }>;
  previewFam(code: string): Promise<FamPreview | null>;
  joinFam(code: string): Promise<string>;
  regenerateFamCode(famId: string): Promise<Fam>;
  leaveFam(famId: string): Promise<void>;
  kickFamMember(famId: string, userId: string): Promise<void>;

  // 안전 설정
  getSafety(): Promise<SafetySettings>;
  saveSafety(patch: Partial<Omit<SafetySettings, "user_id">>): Promise<SafetySettings>;

  // 낙상 / SOS
  startFall(source: AlertSource, kind?: AlertKind): Promise<EmergencyAlert>;
  getMyAlert(alertId: string): Promise<EmergencyAlert | null>;
  cancelFall(alertId: string): Promise<EmergencyAlert>;
  sendFall(alertId: string, reason: "timeout" | "manual"): Promise<EmergencyAlert>;
  resolveFall(alertId: string): Promise<EmergencyAlert>;
  respondFall(alertId: string, response: Exclude<RecipientStatus, "delivered">): Promise<void>;
  getAlertDetail(alertId: string): Promise<AlertDetail | null>;
  getAlertRecipients(alertId: string): Promise<AlertRecipient[]>;
  listIncomingAlerts(): Promise<AlertDetail[]>;
  /** 내 낙상 + 내가 받은 알림 기록 (최신순) */
  listAlertHistory(limit?: number): Promise<AlertDetail[]>;
  /** 진행 중인 내 알림에 현재 위치 올리기 */
  updateAlertLocation(alertId: string, loc: GeoInput): Promise<EmergencyAlert>;
  getRecipientCount(): Promise<number>;

  /** emergency_alerts / alert_recipients 변경을 구독. 반환값으로 구독 해제 */
  subscribeAlerts(onChange: (alertId: string) => void): () => void;
}
