import { FormEvent, useState, ChangeEvent } from "react";
import { api } from "../services/api";
import { btn, btnSecondary, field, fieldLabel, card, errorText, muted, cn } from "../ui";

export function ContactForm() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    userType: "",
    city: "",
    subject: "",
    message: "",
    consent: false,
  });

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  const USER_TYPES = [
    "Customer / Consumer",
    "Business Owner / Service Provider",
    "General Visitor",
  ];

  const CITIES = ["Sambalpur", "Jharsuguda", "Bargarh", "Balangir", "Other"];

  const SUBJECTS = [
    "List My Business / Service",
    "Update or Remove Listing",
    "Report Fake Listing / Dispute",
    "Technical Support",
    "Advertising / Partnerships",
    "General Question",
  ];

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Full Name is required.";
    
    // Indian Phone format check (must extract 10 digits)
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (phoneDigits.length !== 10) {
      errs.phone = "Enter a valid 10-digit phone number.";
    }

    if (form.email.trim()) {
      if (!/^[^@]+@[^@]+\.[^@]+$/.test(form.email.trim())) {
        errs.email = "Enter a valid email address.";
      }
    }

    if (!form.userType) errs.userType = "Select your user type.";
    if (!form.city) errs.city = "Select your city / region.";
    if (!form.subject) errs.subject = "Select your inquiry subject.";
    if (!form.message.trim()) errs.message = "Message is required.";
    if (!form.consent) errs.consent = "You must agree to the Privacy Policy and intermediate role.";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFileError("");
    setFile(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Validate size (5MB = 5 * 1024 * 1024 bytes)
    if (selected.size > 5 * 1024 * 1024) {
      setFileError("File size exceeds 5MB limit.");
      return;
    }

    // Validate type (images or PDF)
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ];
    if (!allowedTypes.includes(selected.type)) {
      setFileError("Only JPEG, PNG, WebP, GIF, or PDF files are allowed.");
      return;
    }

    setFile(selected);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!validate() || fileError) return;

    setBusy(true);
    setErrors({});

    try {
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("phone", form.phone);
      if (form.email.trim()) {
        formData.append("email", form.email);
      }
      formData.append("user_type", form.userType);
      formData.append("city", form.city);
      formData.append("subject", form.subject);
      formData.append("message", form.message);
      formData.append("consent", String(form.consent));
      if (file) {
        formData.append("attachment", file);
      }

      await api.post("/contact", formData);
      setSuccess(true);
      setForm({
        name: "",
        phone: "",
        email: "",
        userType: "",
        city: "",
        subject: "",
        message: "",
        consent: false,
      });
      setFile(null);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Something went wrong. Please try again.";
      setErrors({ server: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-[640px] mx-auto p-[clamp(1rem,4vw,2.5rem)]">
      {success ? (
        <div className={cn(card, "p-8 text-center border-emerald-500/30 bg-emerald-50/50 shadow-lg animate-landing-rise")}>
          <div className="w-16 h-16 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h2 className="text-2xl font-bold font-display text-ink mb-3">Message Sent Successfully!</h2>
          <p className="text-[0.98rem] leading-relaxed text-[#4a5568] mb-6">
            Thank you for reaching out. We have received your inquiry and will review it shortly. If you provided an email, you will receive a confirmation shortly.
          </p>
          <button
            type="button"
            className={btn}
            onClick={() => setSuccess(false)}
          >
            Send Another Inquiry
          </button>
        </div>
      ) : (
        <div className={cn(card, "p-[clamp(1.25rem,4vw,2.5rem)] border-line bg-white shadow-xl rounded-[24px] text-left")}>
          <div className="mb-8">
            <h2 className="text-2xl font-extrabold font-display tracking-tight text-ink mb-2">Contact Support &amp; Enquiries</h2>
            <p className="m-0 text-[0.92rem] leading-normal text-[#6b6560]">
              Got questions, listing issues, or need help? Send us a message and we'll reply as soon as possible.
            </p>
          </div>

          <form className="grid gap-[1.1rem]" onSubmit={handleSubmit} noValidate>
            {errors.server && (
              <div className="p-3.5 bg-rose-50 border border-solid border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
                {errors.server}
              </div>
            )}

            {/* Name */}
            <div className={field}>
              <label className={fieldLabel} htmlFor="contact-name">Full Name *</label>
              <input
                id="contact-name"
                type="text"
                className="w-full"
                placeholder="e.g. Rajesh Meher"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={busy}
              />
              {errors.name && <p className={errorText}>{errors.name}</p>}
            </div>

            {/* Phone */}
            <div className={field}>
              <label className={fieldLabel} htmlFor="contact-phone">Phone Number (Indian 10-digit) *</label>
              <input
                id="contact-phone"
                type="tel"
                className="w-full"
                placeholder="e.g. 9876543210"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                disabled={busy}
              />
              {errors.phone && <p className={errorText}>{errors.phone}</p>}
            </div>

            {/* Email */}
            <div className={field}>
              <label className={fieldLabel} htmlFor="contact-email">Email Address (Optional)</label>
              <input
                id="contact-email"
                type="email"
                className="w-full"
                placeholder="e.g. rajesh@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={busy}
              />
              {errors.email && <p className={errorText}>{errors.email}</p>}
            </div>

            {/* Grid for User Type & City */}
            <div className="grid grid-cols-2 gap-4 max-[480px]:grid-cols-1">
              {/* User Type */}
              <div className={field}>
                <label className={fieldLabel} htmlFor="contact-user-type">User Type *</label>
                <select
                  id="contact-user-type"
                  className="w-full"
                  value={form.userType}
                  onChange={(e) => setForm({ ...form, userType: e.target.value })}
                  disabled={busy}
                >
                  <option value="">Select Option</option>
                  {USER_TYPES.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                {errors.userType && <p className={errorText}>{errors.userType}</p>}
              </div>

              {/* City */}
              <div className={field}>
                <label className={fieldLabel} htmlFor="contact-city">City / Region *</label>
                <select
                  id="contact-city"
                  className="w-full"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  disabled={busy}
                >
                  <option value="">Select Option</option>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {errors.city && <p className={errorText}>{errors.city}</p>}
              </div>
            </div>

            {/* Subject */}
            <div className={field}>
              <label className={fieldLabel} htmlFor="contact-subject">Inquiry Subject *</label>
              <select
                id="contact-subject"
                className="w-full text-sm font-semibold"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                disabled={busy}
              >
                <option value="">Select Subject</option>
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {errors.subject && <p className={errorText}>{errors.subject}</p>}
            </div>

            {/* Message */}
            <div className={field}>
              <label className={fieldLabel} htmlFor="contact-message">Message *</label>
              <textarea
                id="contact-message"
                className="w-full h-32"
                placeholder="Details of your request, listing update details, or support query..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                disabled={busy}
              />
              {errors.message && <p className={errorText}>{errors.message}</p>}
            </div>

            {/* File Upload */}
            <div className={field}>
              <label className={fieldLabel} htmlFor="contact-file">Attachment (PDF, Images up to 5MB - Optional)</label>
              <div className="relative">
                <input
                  id="contact-file"
                  type="file"
                  accept="image/*,application/pdf"
                  className="w-full border-dashed"
                  onChange={handleFileChange}
                  disabled={busy}
                />
              </div>
              {fileError && <p className={errorText}>{fileError}</p>}
              {file && <p className="m-0 mt-1 text-xs text-emerald-600 font-semibold">✓ {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB) selected.</p>}
            </div>

            {/* Consent Checkbox */}
            <div className="flex items-start gap-2.5 mt-1.5">
              <input
                id="contact-consent"
                type="checkbox"
                className="mt-[0.15rem] cursor-pointer"
                checked={form.consent}
                onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                disabled={busy}
              />
              <label htmlFor="contact-consent" className="text-xs leading-normal select-none cursor-pointer text-[#4a5568]">
                I agree to the Privacy Policy and acknowledge that KoshalKarobar is a directory intermediary. *
              </label>
            </div>
            {errors.consent && <p className={cn(errorText, "mt-[-0.5rem]")}>{errors.consent}</p>}

            {/* Actions Buttons */}
            <div className="grid grid-cols-[1.25fr_1fr] gap-4 items-center mt-4 max-[480px]:grid-cols-1">
              <button
                type="submit"
                className={cn(btn, "w-full justify-center")}
                disabled={busy}
              >
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  "Submit Enquiry"
                )}
              </button>

              {/* Chat on WhatsApp Button */}
              <a
                href="https://wa.me/918895000000"
                target="_blank"
                rel="noreferrer"
                className={cn(
                  btnSecondary,
                  "w-full justify-center border-[#25D366]/40 text-[#128C7E] bg-[#25D366]/6 hover:bg-[#25D366]/16 hover:border-[#25D366]/60 hover:text-[#075E54] no-underline"
                )}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="mr-1.5 shrink-0"
                >
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.727-1.458L0 24zm6.59-4.846c1.666.988 3.396 1.472 5.352 1.473 5.564 0 10.09-4.522 10.093-10.098.002-2.701-1.047-5.24-2.954-7.149C17.23 1.471 14.693.422 12.01.422 6.442.422 1.916 4.942 1.914 10.518c-.001 1.84.453 3.633 1.37 5.2L2.247 21.66l6.4-1.68c-.001.002 0 .002 0 .002z" />
                  <path d="M12.01 4.542h-.01c-3.298 0-5.98 2.68-5.983 5.983 0 .736.19 1.455.553 2.083l-2.008 7.33 7.498-1.968c.594.324 1.258.496 1.942.496 3.299 0 5.98-2.68 5.983-5.983 0-1.597-.62-3.1-1.753-4.232a5.94 5.94 0 0 0-4.222-1.709zM16.38 13.91c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06a6.561 6.561 0 0 1-1.93-1.19c-.58-.51-.97-1.15-1.08-1.35-.11-.2-.01-.31.11-.43l.35-.41c.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42s-.54-1.3-.74-1.78c-.2-.48-.4-.41-.54-.42l-.46-.01c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2.01 0 1.19.86 2.33.98 2.49.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28z" />
                </svg>
                Chat on WhatsApp
              </a>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
