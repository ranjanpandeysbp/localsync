import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { InquiryChatPanel, startOrOpenChat } from "../components/InquiryChat";
import { MapsLink } from "../components/MapsLink";
import { PostRequestModal } from "../components/PostRequestModal";
import { offerKindLabel } from "../components/ProviderTrust";
import { api } from "../services/api";
import { useAuth } from "../store/auth";
import { isProviderOnlineNow } from "../utils/businessHours";
import { savePostRequestDraft, type PostRequestDraft } from "../utils/postRequestDraft";
import type { ProviderPublicProfile } from "../types";
import { brand, btn, btnSecondary, iconBtn } from "../ui";

export function PublicProviderPage() {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const signedIn = Boolean(token && user);
  const [profile, setProfile] = useState<ProviderPublicProfile | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState("");
  const [openingChat, setOpeningChat] = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postDraft, setPostDraft] = useState<PostRequestDraft | null>(null);
  const [activeChat, setActiveChat] = useState<{
    id: string;
    title: string;
    ownerName: string;
    isOnline: boolean;
  } | null>(null);

  useEffect(() => {
    if (!slugOrId) return;
    setLoading(true);
    setError("");
    void api
      .get<ProviderPublicProfile>(`/providers/public/${slugOrId}`)
      .then((res) => setProfile(res.data))
      .catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Provider not found";
        setError(String(msg));
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [slugOrId]);

  const shareUrl =
    typeof window !== "undefined" && profile
      ? `${window.location.origin}${profile.public_url_path}`
      : profile?.public_url_path || "";

  const showConsumerActions = !signedIn || user?.role === "CONSUMER";
  const online = profile
    ? isProviderOnlineNow({
        opening_time: profile.opening_time,
        closing_time: profile.closing_time,
        verification_status: profile.verification_status,
      })
    : false;

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

  function buildRequestDraft(): PostRequestDraft | null {
    if (!profile) return null;
    const categoryId = profile.category_id ?? profile.category_ids?.[0] ?? null;
    return {
      providerIds: [profile.user_id],
      categoryId,
      categoryLabels: profile.categories,
      providers: [
        {
          id: profile.user_id,
          name: profile.business_name || profile.full_name || "Provider",
          categoryId,
        },
      ],
    };
  }

  function openSendRequest() {
    const draft = buildRequestDraft();
    if (!draft) return;
    setActionError("");
    if (!signedIn || !user) {
      savePostRequestDraft(draft);
      navigate("/?login=1");
      return;
    }
    if (user.role !== "CONSUMER") {
      setActionError("Only consumers can send requests. Sign in with a consumer account.");
      return;
    }
    setPostDraft(draft);
    setPostModalOpen(true);
  }

  async function openChat() {
    if (!profile) return;
    setActionError("");
    if (!signedIn || !user) {
      navigate("/?login=1");
      return;
    }
    if (user.role !== "CONSUMER") {
      setActionError("Only consumers can chat with providers. Sign in with a consumer account.");
      return;
    }
    if (openingChat) return;
    setOpeningChat(true);
    try {
      const conv = await startOrOpenChat(
        profile.user_id,
        profile.category_id ?? profile.category_ids?.[0],
        `Hi, I'm interested in your services.`,
      );
      setActiveChat({
        id: conv.id,
        title: profile.business_name || profile.full_name || "Provider",
        ownerName: profile.full_name || "",
        isOnline: online,
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Cannot start chat";
      setActionError(String(msg));
    } finally {
      setOpeningChat(false);
    }
  }

  return (
    <div className="min-h-screen max-w-full min-w-0 overflow-x-clip bg-canvas">
      <header className="sticky top-0 z-30 backdrop-blur-[12px] bg-[rgba(250,249,245,0.92)] border-b border-solid border-line">
        <div className="w-[min(1120px,calc(100%-2rem))] mx-auto py-4 flex items-center justify-between gap-4 min-w-0">
          <Link to="/" className={`${brand} text-[1.35rem]`}>
            KoshalHaat
          </Link>
          <div className="flex gap-[0.55rem] flex-wrap items-center">
            {!token && (
              <>
                <Link className={btnSecondary} to="/?login=1">
                  Log in
                </Link>
                <Link className={btn} to="/?register=1">
                  Register
                </Link>
              </>
            )}
            {token && (
              <Link className={btn} to="/">
                Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="w-[min(920px,calc(100%-2rem))] mx-auto mb-10 box-border pt-6">
        {loading && <p className="muted">Loading provider…</p>}
        {error && !loading && (
          <div className="page-panel" style={{ maxWidth: 640 }}>
            <h2>Provider unavailable</h2>
            <p className="error">{error}</p>
            <Link className="btn" to="/">
              Back to home
            </Link>
          </div>
        )}

        {profile && !loading && (
          <div className="page-stack public-provider">
            <header className="page-hero">
              <div className="page-hero-row">
                <div>
                  <p className="dash-eyebrow">Verified provider</p>
                  <h1 className="public-provider-title">{profile.business_name}</h1>
                  {profile.full_name && <p className="muted page-meta">{profile.full_name}</p>}
                </div>
                <span className={`pill ${online ? "online" : "offline"}`}>
                  {online ? "Online" : "Offline"}
                </span>
              </div>
              <p className="page-lead">
                {offerKindLabel(profile.offer_kind)} · Rating {profile.average_rating.toFixed(1)} (
                {profile.rating_count}) · serves up to {profile.max_radius_km} km
              </p>
            </header>

            <section className="page-panel">
              <div className="public-provider-section-head">
                <h2>Services &amp; categories</h2>
                {showConsumerActions && (
                  <div className="public-provider-section-actions">
                    <button
                      type="button"
                      className={`${iconBtn} relative w-[2.35rem] h-[2.35rem] rounded-xl border-primary/18 bg-primary/6 text-primary hover:bg-primary/12 hover:border-primary/35 disabled:opacity-55 disabled:cursor-wait`}
                      title={
                        openingChat
                          ? "Opening chat…"
                          : `Chat with ${profile.business_name}`
                      }
                      aria-label={
                        openingChat
                          ? "Opening chat…"
                          : `Chat with ${profile.business_name}`
                      }
                      disabled={openingChat}
                      onClick={() => void openChat()}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                    <button className="btn" type="button" onClick={openSendRequest}>
                      Send a request
                    </button>
                  </div>
                )}
              </div>
              {actionError && <p className="error">{actionError}</p>}
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
            </section>

            <section className="page-panel">
              <h2>What they offer</h2>
              {profile.offerings_detail ? (
                <p style={{ whiteSpace: "pre-wrap" }}>{profile.offerings_detail}</p>
              ) : (
                <p className="muted">
                  Detailed offerings not added yet. Register and chat to ask about services.
                </p>
              )}
            </section>

            <section className="page-panel">
              <h2>About</h2>
              {profile.description ? (
                <p style={{ whiteSpace: "pre-wrap" }}>{profile.description}</p>
              ) : (
                <p className="muted">No business description yet.</p>
              )}
            </section>

            <section className="page-panel">
              <h2>Location</h2>
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
                {!profile.location_label && !profile.city && !profile.pincode && (
                  <p className="muted">No location listed yet.</p>
                )}
              </div>

              <MapsLink
                latitude={profile.latitude}
                longitude={profile.longitude}
                maps_url={profile.maps_url}
                label={profile.location_label || undefined}
              />

              {(profile.website_url || profile.instagram_url || profile.youtube_url) && (
                <div className="page-actions" style={{ marginTop: "0.75rem" }}>
                  {profile.website_url && (
                    <a
                      className="btn secondary"
                      href={profile.website_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Website
                    </a>
                  )}
                  {profile.instagram_url && (
                    <a
                      className="btn secondary"
                      href={profile.instagram_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Instagram
                    </a>
                  )}
                  {profile.youtube_url && (
                    <a
                      className="btn secondary"
                      href={profile.youtube_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      YouTube
                    </a>
                  )}
                </div>
              )}

              <div className="page-actions" style={{ marginTop: "1rem" }}>
                <button className="btn secondary" type="button" onClick={() => void copyLink()}>
                  {copied ? "Link copied" : "Copy public link"}
                </button>
              </div>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.65rem", wordBreak: "break-all" }}>
                {shareUrl}
              </p>
            </section>
          </div>
        )}
      </section>

      {signedIn && user?.role === "CONSUMER" && (
        <PostRequestModal
          open={postModalOpen}
          draft={postDraft}
          onClose={() => {
            setPostModalOpen(false);
            setPostDraft(null);
          }}
          onSuccess={() => {
            setPostDraft(null);
            setActiveChat(null);
          }}
        />
      )}

      {activeChat && (
        <InquiryChatPanel
          conversationId={activeChat.id}
          mode="overlay"
          title={activeChat.title}
          subtitle={
            activeChat.ownerName && activeChat.ownerName !== activeChat.title
              ? activeChat.ownerName
              : "Inquiry chat"
          }
          avatarLabel={activeChat.title}
          statusLabel={activeChat.isOnline ? "Online" : "Offline"}
          statusTone={activeChat.isOnline ? "online" : "offline"}
          autoFocus
          emptyHint="Say hello and ask about availability, pricing, or timing."
          placeholder="Write a message…"
          onClose={() => setActiveChat(null)}
        />
      )}
    </div>
  );
}
