import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../store/auth";
import type { UserRole } from "../types";

function roleHome(role: UserRole) {
  if (role === "PROVIDER") return "/provider/overview";
  if (role === "ADMIN") return "/admin/providers";
  return "/consumer/details";
}

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
    return <Navigate to="/login" replace />;
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
