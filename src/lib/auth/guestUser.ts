const GUEST_USER_STORAGE_KEY = "nomtrail.guestUserId";
const GUEST_MODE_STORAGE_KEY = "nomtrail.guestModeEnabled";
export const SERVER_ANONYMOUS_USER_ID = "anonymous-server-user";

function createGuestUserId() {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `guest_${randomId}`;
}

export function getOrCreateGuestUserId() {
  if (typeof window === "undefined") {
    return SERVER_ANONYMOUS_USER_ID;
  }

  const existing = window.localStorage.getItem(GUEST_USER_STORAGE_KEY);
  if (existing) return existing;

  const guestId = createGuestUserId();
  window.localStorage.setItem(GUEST_USER_STORAGE_KEY, guestId);
  return guestId;
}

export function enableGuestMode() {
  if (typeof window === "undefined") {
    return SERVER_ANONYMOUS_USER_ID;
  }

  const guestId = getOrCreateGuestUserId();
  window.localStorage.setItem(GUEST_MODE_STORAGE_KEY, "true");
  return guestId;
}

export function isGuestModeEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(GUEST_MODE_STORAGE_KEY) === "true";
}

export function resolveClientUserId(userId?: string | null) {
  if (userId) return userId;
  return isGuestModeEnabled() ? getOrCreateGuestUserId() : SERVER_ANONYMOUS_USER_ID;
}
