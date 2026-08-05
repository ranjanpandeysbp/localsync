import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MapsLink } from "../components/MapsLink";
import { offerKindLabel } from "../components/ProviderTrust";
import { api } from "../services/api";
import { useAuth } from "../store/auth";
import type { ProviderPublicProfile } from "../types";

export function PublicProviderPage() {
  const { userId } = useParams<{ userId: string }>();
  const { user, token } = useAuth();
  const [profile, setProfile] = useState<ProviderPublicProfile | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError("");
    void api
      .get<ProviderPublicProfile>(`/providers/public/${userId}`)
      .then((res) => setProfile(res.data))
      .catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Provider not found";
        setError(String(msg));
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const shareUrl =
    typeof window !== "undefined" && profile
      ? `${window.location.origin}${profile.public_url_path}`
      : profile?.public_url_path || "";

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const chatCta =
    token && user?.role === "CONSUMER"
      ? { to: "/consumer/providers", label: "Open providers & chat" }
      : token
        ? { to: "/", label: "Go to dashboard" }
        : { to: "/register", label: "Register to chat or request" };

  return (
    <div className="landing">
      <header className="landing-top">
        <div className="landing-top-inner">
          <Link to="/" className="brand landing-brand">
            LocalSync
          </Link>
          <div className="landing-auth">
            {!token && (
              <>
                <Link className="btn secondary" to="/login">
                  Log in
                </Link>
                <Link className="btn" to="/register">
                  Register
                </Link>
              </>
            )}
            {token && (
              <Link className="btn" to="/">
                Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="landing-section" style={{ paddingTop: "1.5rem" }}>
        {loading && <p className="muted">Loading provider…</p>}
        {error && !loading && (
          <div className="card">
            <h2>Provider unavailable</h2>
            <p className="error">{error}</p>
            <Link className="btn" to="/">
              Back to home
            </Link>
          </div>
        )}

        {profile && !loading && (
          <div className="public-provider">
            <div className="card public-provider-hero">
              <div className="topbar" style={{ marginBottom: "0.75rem" }}>
                <div>
                  <p className="landing-kicker" style={{ marginBottom: "0.35rem" }}>
                    Verified provider
                  </p>
                  <h1 className="public-provider-title">{profile.business_name}</h1>
                  {profile.full_name && <p className="muted">{profile.full_name}</p>}
                </div>
                <span className={`pill ${profile.is_online ? "online" : "offline"}`}>
                  {profile.is_online ? "Online" : "Offline"}
                </span>
              </div>

              <p className="muted">
                {offerKindLabel(profile.offer_kind)} · Rating {profile.average_rating.toFixed(1)} (
                {profile.rating_count}) · serves up to {profile.max_radius_km} km
              </p>

              <div className="public-provider-meta">
                {(profile.location_label || profile.city || profile.pincode) && (
                  <p className="muted">
                    {[profile.location_label, profile.city, profile.state, profile.pincode]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {profile.opening_time && profile.closing_time && (
                  <p className="muted">
                    Hours {profile.opening_time}–{profile.closing_time}
                  </p>
                )}
                {profile.gst_number && <p className="muted">GST {profile.gst_number}</p>}
              </div>

              <MapsLink
                latitude={profile.latitude}
                longitude={profile.longitude}
                maps_url={profile.maps_url}
                label={profile.location_label || undefined}
              />

              {(profile.website_url || profile.instagram_url || profile.youtube_url) && (
                <div className="nav-actions" style={{ marginTop: "0.75rem", flexWrap: "wrap" }}>
                  {profile.website_url && (
                    <a className="btn secondary" href={profile.website_url} target="_blank" rel="noreferrer">
                      Website
                    </a>
                  )}
                  {profile.instagram_url && (
                    <a className="btn secondary" href={profile.instagram_url} target="_blank" rel="noreferrer">
                      Instagram
                    </a>
                  )}
                  {profile.youtube_url && (
                    <a className="btn secondary" href={profile.youtube_url} target="_blank" rel="noreferrer">
                      YouTube
                    </a>
                  )}
                </div>
              )}

              <div className="landing-cta" style={{ marginTop: "1rem" }}>
                <Link className="btn" to={chatCta.to}>
                  {chatCta.label}
                </Link>
                {!token && (
                  <Link className="btn secondary" to="/login">
                    Log in
                  </Link>
                )}
                <button className="btn secondary" type="button" onClick={() => void copyLink()}>
                  {copied ? "Link copied" : "Copy public link"}
                </button>
              </div>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.65rem", wordBreak: "break-all" }}>
                {shareUrl}
              </p>
            </div>

            <div className="card">
              <h2>Services & categories</h2>
              {profile.categories.length === 0 ? (
                <p className="muted">No categories listed yet.</p>
              ) : (
                <div className="public-chip-row">
                  {profile.categories.map((c) => (
                    <span key={c} className="public-chip">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h2>About</h2>
              {profile.description ? (
                <p style={{ whiteSpace: "pre-wrap" }}>{profile.description}</p>
              ) : (
                <p className="muted">No business description yet.</p>
              )}
            </div>

            <div className="card">
              <h2>What they offer</h2>
              {profile.offerings_detail ? (
                <p style={{ whiteSpace: "pre-wrap" }}>{profile.offerings_detail}</p>
              ) : (
                <p className="muted">
                  Detailed offerings not added yet. Register and chat to ask about services.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
