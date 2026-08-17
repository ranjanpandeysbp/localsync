import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { LandingPage } from "./LandingPage";

export function HomeRedirect() {
  const { user, loading, token } = useAuth();

  if (loading) {
    return (
      <div className="auth-wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!token || !user) return <LandingPage />;
  if (user.role === "PROVIDER") return <Navigate to="/provider/overview" replace />;
  if (user.role === "ADMIN" || user.role === "CUSTOMER_SERVICE") {
    return <Navigate to="/admin/overview" replace />;
  }
  // Consumers stay on the public landing while signed in.
  return <LandingPage />;
}
