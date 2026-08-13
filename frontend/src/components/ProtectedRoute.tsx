import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../store/auth";
import { isLogoutNavigation } from "../utils/logoutNav";
import { isStaffRole, roleHome, type UserRole } from "../types";

/** Blocks unauthenticated users; optionally restricts by role. */
export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { user, loading, token } = useAuth();

  if (loading) {
    return (
      <div className="auth-wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!token || !user) {
    // Intentional logout → landing without forcing the sign-in modal.
    return <Navigate to={isLogoutNavigation() ? "/" : "/?login=1"} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return <Outlet />;
}

/** Public auth pages — redirect away if already signed in. */
export function GuestRoute() {
  const { user, loading, token } = useAuth();

  if (loading) {
    return (
      <div className="auth-wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (token && user) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return <Outlet />;
}

export { isStaffRole, roleHome };
