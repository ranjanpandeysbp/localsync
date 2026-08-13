const LOGOUT_NAV_KEY = "ls_logout_nav";

/** Mark an intentional logout so redirects skip the sign-in modal. */
export function markLogoutNavigation(): void {
  try {
    sessionStorage.setItem(LOGOUT_NAV_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isLogoutNavigation(): boolean {
  try {
    return sessionStorage.getItem(LOGOUT_NAV_KEY) === "1";
  } catch {
    return false;
  }
}

/** Read and clear the logout flag (landing page cleanup). */
export function consumeLogoutNavigation(): boolean {
  try {
    if (sessionStorage.getItem(LOGOUT_NAV_KEY) === "1") {
      sessionStorage.removeItem(LOGOUT_NAV_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
