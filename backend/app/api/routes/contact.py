import html
import re
import logging
from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.uploads import save_upload_file
from app.services.email import try_send_email, get_or_create_smtp_config
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contact", tags=["contact"])

USER_TYPES = ["Customer / Consumer", "Business Owner / Service Provider", "General Visitor"]
CITIES = ["Sambalpur", "Jharsuguda", "Bargarh", "Balangir", "Other"]
SUBJECTS = [
    "List My Business / Service",
    "Update or Remove Listing",
    "Report Fake Listing / Dispute",
    "Technical Support",
    "Advertising / Partnerships",
    "General Question"
]

@router.post("", status_code=status.HTTP_200_OK)
async def submit_contact_form(
    name: str = Form(...),
    phone: str = Form(...),
    email: str | None = Form(None),
    user_type: str = Form(...),
    city: str = Form(...),
    subject: str = Form(...),
    message: str = Form(...),
    consent: bool = Form(...),
    attachment: UploadFile | None = File(None),
    db: Session = Depends(get_db)
):
    # 1. Validation
    name_clean = name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Full Name is required.")
    if len(name_clean) > 100:
        raise HTTPException(status_code=400, detail="Name cannot exceed 100 characters.")

    # Validate phone (digits only, must be 10 digits)
    phone_digits = re.sub(r"\D", "", phone)
    if len(phone_digits) != 10:
        raise HTTPException(status_code=400, detail="Phone number must be a valid 10-digit number.")

    # Validate optional email
    if email:
        email_clean = email.strip()
        if not re.match(r"^[^@]+@[^@]+\.[^@]+$", email_clean):
            raise HTTPException(status_code=400, detail="Email address is invalid.")
    else:
        email_clean = None

    if user_type not in USER_TYPES:
        raise HTTPException(status_code=400, detail="Invalid User Type selected.")

    if city not in CITIES:
        raise HTTPException(status_code=400, detail="Invalid City/Region selected.")

    if subject not in SUBJECTS:
        raise HTTPException(status_code=400, detail="Invalid Inquiry Subject selected.")

    message_clean = message.strip()
    if not message_clean:
        raise HTTPException(status_code=400, detail="Message content is required.")
    if len(message_clean) > 2000:
        raise HTTPException(status_code=400, detail="Message cannot exceed 2000 characters.")

    if not consent:
        raise HTTPException(status_code=400, detail="You must consent to the Privacy Policy.")

    # 2. Handle File Attachment
    attachment_url = None
    original_filename = None
    if attachment and attachment.filename:
        # save_upload_file does type checks and size validation (< max_upload_bytes)
        try:
            stored_name, original, _, _ = await save_upload_file(attachment)
            original_filename = original
            attachment_url = f"{settings.frontend_url.replace(':5173', ':8000')}/media/{stored_name}"
        except Exception as exc:
            logger.error("Failed to save contact upload: %s", exc)
            raise HTTPException(
                status_code=400,
                detail=getattr(exc, "detail", "Failed to process the uploaded file. Check type/size.")
            ) from exc

    # 3. Sanitization
    name_sanitized = html.escape(name_clean)
    message_sanitized = html.escape(message_clean)
    email_sanitized = html.escape(email_clean) if email_clean else None

    # 4. Routing Priority / Urgency check
    is_urgent = subject == "Report Fake Listing / Dispute"
    priority_prefix = "[URGENT] " if is_urgent else ""

    # Fetch Config for admin recipient email
    cfg = get_or_create_smtp_config(db)
    admin_recipient = (cfg.support_email or "support@koshalkarobar.in").strip()

    # 5. Email Templates & Sending
    # HTML template wrapper mimicking the app design
    html_layout = """
    <!DOCTYPE html>
    <html>
      <body style="margin:0;padding:0;background:#f3f1ea;font-family:Segoe UI,Roboto,sans-serif;color:#1c1917;padding:24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;margin:0 auto;background:#fffcf7;border:1px solid #e7e0d4;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.03);">
          <tr>
            <td style="padding:24px;background:#0f4c43;color:#f7f3ea;">
              <h2 style="margin:0;font-size:20px;letter-spacing:0.02em;">KoshalKarobar</h2>
              <p style="margin:4px 0 0;font-size:12px;color:#eaa11d;">Connecting Homes, Empowering Business</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px;line-height:1.6;font-size:15px;">
              {content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#fbf9f4;border-top:1px solid #e7e0d4;font-size:12px;color:#6b6560;text-align:center;">
              This is an automated platform notification from KoshalKarobar.
            </td>
          </tr>
        </table>
      </body>
    </html>
    """

    # Admin Email
    admin_html_content = f"""
    <h3 style="margin:0 0 16px;color:#0f4c43;font-size:18px;">New Lead Received</h3>
    <table cellpadding="4" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr><td style="font-weight:bold;width:130px;border-bottom:1px solid #f1ece1;padding:8px 0;">Name:</td><td style="border-bottom:1px solid #f1ece1;padding:8px 0;">{name_sanitized}</td></tr>
      <tr><td style="font-weight:bold;border-bottom:1px solid #f1ece1;padding:8px 0;">Phone:</td><td style="border-bottom:1px solid #f1ece1;padding:8px 0;">{phone_digits}</td></tr>
      <tr><td style="font-weight:bold;border-bottom:1px solid #f1ece1;padding:8px 0;">Email:</td><td style="border-bottom:1px solid #f1ece1;padding:8px 0;">{email_sanitized or "Not provided"}</td></tr>
      <tr><td style="font-weight:bold;border-bottom:1px solid #f1ece1;padding:8px 0;">User Type:</td><td style="border-bottom:1px solid #f1ece1;padding:8px 0;">{user_type}</td></tr>
      <tr><td style="font-weight:bold;border-bottom:1px solid #f1ece1;padding:8px 0;">City / Region:</td><td style="border-bottom:1px solid #f1ece1;padding:8px 0;">{city}</td></tr>
      <tr><td style="font-weight:bold;border-bottom:1px solid #f1ece1;padding:8px 0;">Subject:</td><td style="border-bottom:1px solid #f1ece1;padding:8px 0;font-weight:bold;{'color:#d84315;' if is_urgent else ''}">{subject}</td></tr>
    </table>
    <p style="margin:16px 0 6px;font-weight:bold;">Message:</p>
    <div style="background:#f7f5ef;padding:12px 16px;border-radius:8px;font-size:14px;white-space:pre-wrap;border:1px solid #e7e0d4;color:#2e2d2a;">{message_sanitized}</div>
    """
    if attachment_url:
        admin_html_content += f"""
        <p style="margin:16px 0 0;"><strong>Attachment:</strong> <a href="{attachment_url}" target="_blank" style="color:#0f4c43;font-weight:600;">{original_filename}</a></p>
        """

    admin_subject = f"{priority_prefix}Contact Form Lead: {subject} - {name_clean}"
    admin_body_text = f"Name: {name_clean}\nPhone: {phone_digits}\nEmail: {email_clean or 'Not provided'}\nUser Type: {user_type}\nCity: {city}\nSubject: {subject}\nMessage: {message_clean}\nAttachment: {attachment_url or 'None'}"
    admin_body_html = html_layout.format(content=admin_html_content)

    # Send lead notification to Admin SMTP (non-blocking)
    try_send_email(
        db,
        to_email=admin_recipient,
        subject=admin_subject,
        body_text=admin_body_text,
        body_html=admin_body_html
    )

    # User Confirmation Email (sent only if email is provided)
    if email_clean:
        user_html_content = f"""
        <h3 style="margin:0 0 16px;color:#0f4c43;font-size:18px;">We've Received Your Inquiry</h3>
        <p>Dear {name_sanitized},</p>
        <p>Thank you for reaching out to KoshalKarobar. We have successfully received your inquiry regarding <strong>{subject}</strong>. Our team will review your details and get back to you shortly if required.</p>
        <p style="margin:16px 0 6px;font-weight:bold;">Your message details:</p>
        <div style="background:#f7f5ef;padding:12px 16px;border-radius:8px;font-size:14px;white-space:pre-wrap;border:1px solid #e7e0d4;color:#6b6560;">{message_sanitized}</div>
        <p style="margin:20px 0 0;">Warm regards,<br/><strong>KoshalKarobar Team</strong></p>
        """
        user_subject = f"We received your message: {subject}"
        user_body_text = f"Dear {name_clean},\n\nWe have received your message regarding: {subject}.\n\nMessage details:\n{message_clean}\n\nWarm regards,\nKoshalKarobar Team"
        user_body_html = html_layout.format(content=user_html_content)

        try_send_email(
            db,
            to_email=email_clean,
            subject=user_subject,
            body_text=user_body_text,
            body_html=user_body_html
        )

    return {"status": "success", "message": "Your inquiry has been submitted successfully."}
