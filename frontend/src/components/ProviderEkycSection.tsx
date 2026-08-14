import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { mediaSrc } from "./Attachments";
import { MapsLink } from "./MapsLink";
import { api, apiErrorMessage } from "../services/api";
import { reverseGeocodeDetails } from "../services/geo";
import type { ProviderProfile } from "../types";

type Props = {
  provider: ProviderProfile;
  onUpdated: (profile: ProviderProfile) => void;
};

export function ProviderEkycSection({ provider, onUpdated }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [loc, setLoc] = useState<{
    latitude: number | null;
    longitude: number | null;
    label: string;
  }>({
    latitude: provider.ekyc_latitude ?? null,
    longitude: provider.ekyc_longitude ?? null,
    label: provider.ekyc_location_label || "",
  });
  const [busy, setBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoLive, setVideoLive] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  async function startCamera(forVideoCall = false) {
    setError("");
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: forVideoCall,
      });
      streamRef.current = stream;
      setCameraOn(true);
      setVideoLive(forVideoCall);
      // Attach after React paints the <video> element.
      window.requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      });
    } catch {
      setError("Could not access camera. Allow camera permission and try again.");
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !cameraOn) {
      setError("Start the camera first");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Could not capture photo");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Could not capture photo");
          return;
        }
        if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
        setPhotoBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setNote("Photo captured — capture location, then submit eKYC");
        stopCamera();
      },
      "image/jpeg",
      0.92,
    );
  }

  function captureLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device");
      return;
    }
    setNote("Detecting location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        setLoc({ latitude, longitude, label: "Resolving place…" });
        void reverseGeocodeDetails(latitude, longitude).then((details) => {
          const label =
            details?.location_label?.trim() ||
            details?.city?.trim() ||
            `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
          setLoc({ latitude, longitude, label });
          setNote("Location captured");
        });
      },
      () => {
        setError("Could not detect location. Allow location permission and try again.");
        setNote("");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function submitEkyc() {
    setError("");
    setNote("");
    if (!photoBlob && !provider.ekyc_photo_url) {
      setError("Capture your photo first");
      return;
    }
    if (loc.latitude == null || loc.longitude == null) {
      setError("Capture your location first");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      if (photoBlob) {
        body.append("file", photoBlob, "ekyc-photo.jpg");
      } else if (provider.ekyc_photo_url) {
        // Re-submit requires a file — fetch existing and re-upload when only location changed
        const res = await fetch(mediaSrc(provider.ekyc_photo_url));
        const blob = await res.blob();
        body.append("file", blob, "ekyc-photo.jpg");
      }
      body.append("latitude", String(loc.latitude));
      body.append("longitude", String(loc.longitude));
      if (loc.label) body.append("location_label", loc.label);
      const { data } = await api.post<ProviderProfile>("/providers/me/ekyc", body);
      onUpdated(data);
      setPhotoBlob(null);
      setNote("eKYC photo and location submitted");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not submit eKYC"));
    } finally {
      setBusy(false);
    }
  }

  async function startVideoKyc() {
    setError("");
    setNote("");
    if (!provider.ekyc_photo_url || provider.ekyc_latitude == null) {
      setError("Submit photo and location before starting Video KYC");
      return;
    }
    setVideoBusy(true);
    try {
      await startCamera(true);
      const { data } = await api.post<ProviderProfile>("/providers/me/ekyc/video-request");
      onUpdated(data);
      setNote(
        "Video KYC requested. Keep this camera on — a customer service agent will join via Admin messages.",
      );
    } catch (err) {
      setError(apiErrorMessage(err, "Could not start Video KYC"));
      stopCamera();
      setVideoLive(false);
    } finally {
      setVideoBusy(false);
    }
  }

  const status = (provider.ekyc_status || "NONE").toUpperCase();
  const statusLabel =
    status === "VIDEO_REQUESTED"
      ? "Video KYC requested"
      : status === "SUBMITTED"
        ? "Photo & location submitted"
        : status === "COMPLETED"
          ? "eKYC completed"
          : "Not started";

  const displayPhoto = previewUrl || (provider.ekyc_photo_url ? mediaSrc(provider.ekyc_photo_url) : null);

  return (
    <div className="profile-section profile-ekyc">
      <p className="profile-section-lead muted">
        Capture a live photo and your current GPS location, then start a Video KYC session with a
        Gharq customer service agent.
      </p>

      <p className="profile-verification">
        eKYC status: <strong>{statusLabel}</strong>
        {provider.ekyc_captured_at && (
          <span className="muted">
            {" "}
            · Captured {new Date(provider.ekyc_captured_at).toLocaleString()}
          </span>
        )}
      </p>

      <div className="profile-ekyc-grid">
        <div className="profile-ekyc-camera">
          <p className="dash-eyebrow">Live photo</p>
          <div className="profile-ekyc-stage">
            <video
              ref={videoRef}
              className="profile-ekyc-video"
              playsInline
              muted={!videoLive}
              autoPlay
              hidden={!cameraOn}
            />
            {!cameraOn && displayPhoto && (
              <img src={displayPhoto} alt="eKYC photo" className="profile-ekyc-photo" />
            )}
            {!cameraOn && !displayPhoto && (
              <p className="muted profile-ekyc-placeholder">Camera preview appears here</p>
            )}
          </div>
          <div className="page-actions profile-ekyc-actions">
            {!cameraOn ? (
              <button className="btn secondary" type="button" onClick={() => void startCamera(false)}>
                Open camera
              </button>
            ) : (
              <>
                <button className="btn" type="button" onClick={capturePhoto} disabled={videoLive}>
                  Capture photo
                </button>
                <button className="btn secondary" type="button" onClick={stopCamera}>
                  Close camera
                </button>
              </>
            )}
          </div>
        </div>

        <div className="profile-ekyc-location">
          <p className="dash-eyebrow">Location at capture</p>
          {loc.latitude != null && loc.longitude != null ? (
            <>
              <p className="muted" style={{ margin: "0 0 0.5rem" }}>
                {loc.label || `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`}
              </p>
              <MapsLink latitude={loc.latitude} longitude={loc.longitude} label={loc.label || undefined} />
            </>
          ) : (
            <p className="muted">No eKYC location yet</p>
          )}
          <div className="page-actions profile-ekyc-actions">
            <button className="btn secondary" type="button" onClick={captureLocation}>
              Capture location
            </button>
          </div>
        </div>
      </div>

      <div className="page-actions profile-ekyc-actions">
        <button className="btn" type="button" disabled={busy} onClick={() => void submitEkyc()}>
          {busy ? "Submitting…" : "Submit photo & location"}
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={videoBusy || !provider.ekyc_photo_url}
          onClick={() => void startVideoKyc()}
        >
          {videoBusy ? "Starting…" : videoLive ? "Video KYC live" : "Start Video KYC"}
        </button>
        <Link className="btn secondary" to="/provider/support">
          Open Admin messages
        </Link>
      </div>

      {videoLive && (
        <p className="page-note">
          Your camera and mic are on for Video KYC. Stay on this page while an agent connects through
          Admin messages.
        </p>
      )}
      {note && <p className="page-note">{note}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
