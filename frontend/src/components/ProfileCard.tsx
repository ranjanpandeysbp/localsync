import { Link } from "react-router-dom";
import { useAuth } from "../store/auth";
import type { User } from "../types";
import { MapsLink } from "./MapsLink";

/** Compact summary — full edits live on My profile. */
export function ProfileCard({ title = "Your profile" }: { title?: string }) {
  const user = useAuth((s) => s.user) as User | null;

  if (!user) return null;

  const address = [user.address_line1, user.city, user.pincode].filter(Boolean).join(", ");

  return (
    <div className="card profile-card">
      <div className="topbar" style={{ marginBottom: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <Link className="btn secondary" to="/profile">
          Edit profile
        </Link>
      </div>
      <p>
        <strong>{user.full_name}</strong>
        <span className="pill" style={{ marginLeft: "0.5rem" }}>
          {user.role}
        </span>
        {!user.profile_complete && (
          <span className="pill" style={{ marginLeft: "0.35rem" }}>
            Incomplete
          </span>
        )}
      </p>
      <p className="muted">Mobile: {user.phone_number}</p>
      {user.alternate_phone && <p className="muted">Alt: {user.alternate_phone}</p>}
      {user.email && <p className="muted">Email: {user.email}</p>}
      {address && <p className="muted">{address}</p>}
      <p className="muted">
        Rating: {user.average_rating.toFixed(1)} ({user.rating_count})
      </p>
      <div style={{ marginTop: "0.5rem" }}>
        <MapsLink
          latitude={user.latitude}
          longitude={user.longitude}
          maps_url={user.maps_url}
          label={user.location_label || undefined}
        />
      </div>
    </div>
  );
}
