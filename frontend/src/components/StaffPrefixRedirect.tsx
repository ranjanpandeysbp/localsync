import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../store/auth";
import { remapStaffLocation } from "../types";

/** Keeps admin on `/admin/…` and customer service on `/cs/…`. */
export function StaffPrefixRedirect() {
  const user = useAuth((s) => s.user);
  const location = useLocation();
  if (!user) return <Outlet />;
  const next = remapStaffLocation(user.role, location.pathname, location.search, location.hash);
  if (next && next !== `${location.pathname}${location.search}${location.hash}`) {
    return <Navigate to={next} replace />;
  }
  return <Outlet />;
}
