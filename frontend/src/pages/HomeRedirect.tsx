import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { isStaffRole, roleHome } from "../types";
import { LandingPage } from "./LandingPage";
import { authWrap, muted } from "../ui";

export function HomeRedirect() {
  const { user, loading, token } = useAuth();

  if (loading) {
    return (
      <div className={authWrap}>
        <p className={muted}>Loading…</p>
      </div>
    );
  }

  if (!token || !user) return <LandingPage />;
  if (user.role === "PROVIDER" || isStaffRole(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }
  // Consumers stay on the public landing while signed in.
  return <LandingPage />;
}
