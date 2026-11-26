// DB 함수가 raise 하는 코드 -> 화면 문구
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "로그인이 필요해요.",
  FRIEND_CODE_NOT_FOUND: "그 번호를 가진 친구가 없어요.",
  CANNOT_ADD_SELF: "내 번호는 추가할 수 없어요.",
  REQUEST_ALREADY_SENT: "이미 친구 요청을 보냈어요.",
  REQUEST_NOT_FOUND: "요청을 찾을 수 없어요.",
  REQUEST_ALREADY_HANDLED: "이미 처리된 요청이에요.",
  FRIEND_NOT_FOUND: "친구를 찾을 수 없어요.",
  FAM_NAME_REQUIRED: "팸 이름을 입력해 주세요.",
  TOO_MANY_FAMS: "팸은 최대 10개까지 참여할 수 있어요.",
  INVITE_CODE_NOT_FOUND: "팸 코드가 올바르지 않아요.",
  INVITE_CODE_EXPIRED: "만료된 팸 코드예요. 팸장에게 새 코드를 받아 주세요.",
  FAM_FULL: "팸 인원이 가득 찼어요.",
  FAM_NOT_FOUND: "팸을 찾을 수 없어요.",
  NOT_FAM_OWNER: "방장만 할 수 있어요.",
  USE_LEAVE_INSTEAD: "본인은 '팸 나가기'를 눌러 주세요.",
  FALL_DETECTION_DISABLED: "낙상 감지가 꺼져 있어요. 위험 감지 설정에서 다시 켜 주세요.",
  ALERT_NOT_FOUND: "알림을 찾을 수 없어요.",
  ALERT_ALREADY_SENT: "이미 보호자에게 알림이 전송됐어요.",
  ALERT_NOT_ACTIVE: "이미 끝난 알림이에요.",
  INVALID_RESPONSE: "잘못된 응답이에요.",
  INVALID_STEP_GOAL: "걸음 목표는 1,000 ~ 50,000 사이로 정해 주세요.",
  INVALID_LOCATION: "위치 정보가 올바르지 않아요.",
  DEVICE_NOT_FOUND: "키링을 찾을 수 없어요.",
  TOO_MANY_DEVICES: "키링은 5개까지 등록할 수 있어요.",
  DEVICE_NAME_REQUIRED: "키링 이름을 입력해 주세요.",
  NICKNAME_REQUIRED: "이름을 입력해 주세요.",
  INVALID_HANDLE: "아이디는 영어 소문자 · 숫자 · 점(.) · 밑줄(_)로 2~30자예요.",
  HANDLE_TAKEN: "이미 쓰고 있는 아이디예요.",
  TOO_MANY_TAGS: "태그는 6개까지 넣을 수 있어요.",
  TEXT_TOO_LONG: "글자 수가 너무 많아요.",
  INVALID_URL: "주소가 올바르지 않아요.",
  PROFILE_NOT_FOUND: "프로필을 찾을 수 없어요.",
  NETWORK: "인터넷 연결을 확인해 주세요.",
};

export class ApiError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? MESSAGES[code] ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
    this.code = code;
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const raw =
    typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (code) return new ApiError(code);
  if (/fetch|network|Failed to fetch|Load failed/i.test(raw)) return new ApiError("NETWORK");
  return new ApiError("UNKNOWN");
}

export function errorMessage(e: unknown) {
  return toApiError(e).message;
}
