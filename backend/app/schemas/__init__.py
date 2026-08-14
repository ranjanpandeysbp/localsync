from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.db.models import (
    FulfillmentType,
    OfferKind,
    OrderStatus,
    PaymentMode,
    QuoteStatus,
    RequestStatus,
    RequestTargetMode,
    UserRole,
    VerificationStatus,
)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    """Minimal onboarding — profile details are completed later."""

    role: UserRole
    phone_number: str = Field(min_length=8, max_length=20)
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    email: EmailStr | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    location_label: str | None = Field(default=None, max_length=255)
    pincode: str | None = Field(default=None, max_length=12)


class UserLogin(BaseModel):
    phone_number: str
    password: str


class ForgotPasswordRequest(BaseModel):
    phone_number: str = Field(min_length=8, max_length=20)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10)
    password: str = Field(min_length=6, max_length=128)


class MessageOut(BaseModel):
    detail: str


class UserOut(BaseModel):
    id: UUID
    role: UserRole
    phone_number: str
    username: str
    email: str | None
    full_name: str
    is_active: bool
    is_verified: bool
    average_rating: float
    rating_count: int
    created_at: datetime
    location_label: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    maps_url: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    alternate_phone: str | None = None
    profile_complete: bool = False
    verification_status: VerificationStatus | None = None

    model_config = {"from_attributes": True}


class UserLocationUpdate(BaseModel):
    location_label: str | None = Field(default=None, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class UserProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    email: EmailStr | None = None
    alternate_phone: str | None = Field(default=None, max_length=20)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    pincode: str | None = Field(default=None, max_length=12)
    location_label: str | None = Field(default=None, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class CategoryCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    parent_id: int | None = None
    kind: OfferKind = OfferKind.BOTH


class CategoryOut(BaseModel):
    id: int
    name: str
    slug: str
    description: str | None
    parent_id: int | None = None
    kind: OfferKind = OfferKind.BOTH
    is_active: bool
    children: list["CategoryOut"] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class CategoryTreeOut(BaseModel):
    id: int
    name: str
    slug: str
    description: str | None
    kind: OfferKind
    is_active: bool
    subcategories: list[CategoryOut] = Field(default_factory=list)


class ProviderTrustInfo(BaseModel):
    business_name: str
    full_name: str | None = None
    offer_kind: OfferKind | None = None
    description: str | None = None
    offerings_detail: str | None = None
    opening_time: str | None = None
    closing_time: str | None = None
    gst_number: str | None = None
    average_rating: float = 0
    rating_count: int = 0
    categories: list[str] = Field(default_factory=list)
    maps_url: str | None = None
    location_label: str | None = None
    is_online: bool | None = None
    verification_status: VerificationStatus | None = None


class ProviderCatalogItem(BaseModel):
    user_id: UUID
    full_name: str
    business_name: str
    public_slug: str | None = None
    public_url_path: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    categories: list[str] = Field(default_factory=list)
    description: str | None = None
    offerings_detail: str | None = None
    website_url: str | None = None
    instagram_url: str | None = None
    youtube_url: str | None = None
    offer_kind: OfferKind | None = None
    opening_time: str | None = None
    closing_time: str | None = None
    gst_number: str | None = None
    is_online: bool
    verification_status: VerificationStatus
    average_rating: float
    rating_count: int
    latitude: float | None = None
    longitude: float | None = None
    location_label: str | None = None
    maps_url: str | None = None
    max_radius_km: int


class ProviderPublicOut(BaseModel):
    """Public provider page — no sensitive IDs/documents."""

    user_id: UUID
    business_name: str
    public_slug: str | None = None
    full_name: str | None = None
    description: str | None = None
    offerings_detail: str | None = None
    website_url: str | None = None
    instagram_url: str | None = None
    youtube_url: str | None = None
    offer_kind: OfferKind = OfferKind.BOTH
    categories: list[str] = Field(default_factory=list)
    opening_time: str | None = None
    closing_time: str | None = None
    gst_number: str | None = None
    is_online: bool
    verification_status: VerificationStatus
    average_rating: float = 0
    rating_count: int = 0
    max_radius_km: int
    latitude: float | None = None
    longitude: float | None = None
    location_label: str | None = None
    maps_url: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    public_url_path: str


class ConversationCreate(BaseModel):
    provider_id: UUID
    category_id: int | None = None
    initial_message: str | None = Field(default=None, min_length=1, max_length=2000)


class ProviderConversationCreate(BaseModel):
    """Provider opens / continues inquiry chat with a consumer (e.g. after a request)."""

    consumer_id: UUID
    category_id: int | None = None
    initial_message: str | None = Field(default=None, min_length=1, max_length=2000)


class InquiryMessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_id: UUID
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    id: UUID
    consumer_id: UUID
    provider_id: UUID
    category_id: int | None
    created_at: datetime
    updated_at: datetime
    consumer_name: str | None = None
    provider_name: str | None = None
    provider_business_name: str | None = None
    provider_is_online: bool | None = None
    last_message: str | None = None
    unread_count: int = 0

    model_config = {"from_attributes": True}


class AdminSupportCreate(BaseModel):
    provider_id: UUID
    initial_message: str | None = Field(default=None, min_length=1, max_length=2000)


class AdminSupportMessageOut(BaseModel):
    id: UUID
    conversation_id: UUID
    sender_id: UUID
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminSupportConversationOut(BaseModel):
    id: UUID
    provider_id: UUID
    created_by_admin_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    provider_name: str | None = None
    provider_business_name: str | None = None
    admin_name: str | None = None
    last_message: str | None = None
    unread_count: int = 0
    provider_message_count: int = 0

    model_config = {"from_attributes": True}


class AdminSupportUnreadOut(BaseModel):
    unread_count: int = 0


class ProviderProfileUpdate(BaseModel):
    business_name: str | None = None
    category_id: int | None = None
    category_ids: list[int] | None = None
    description: str | None = None
    offer_kind: OfferKind | None = None
    offerings_detail: str | None = None
    website_url: str | None = None
    instagram_url: str | None = None
    youtube_url: str | None = None
    opening_time: str | None = None
    closing_time: str | None = None
    gst_number: str | None = None
    aadhaar_number: str | None = Field(default=None, max_length=12)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    max_radius_km: int | None = Field(default=None, ge=1, le=50)
    is_online: bool | None = None
    tax_id: str | None = None
    government_id_url: str | None = None
    business_reg_url: str | None = None
    aadhaar_doc_url: str | None = None
    gst_doc_url: str | None = None


class ProviderProfileOut(BaseModel):
    id: UUID
    user_id: UUID
    business_name: str
    public_slug: str | None = None
    public_url_path: str | None = None
    category_id: int | None = None
    category_ids: list[int] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    description: str | None
    offer_kind: OfferKind = OfferKind.BOTH
    offerings_detail: str | None = None
    website_url: str | None = None
    instagram_url: str | None = None
    youtube_url: str | None = None
    opening_time: str | None = None
    closing_time: str | None = None
    gst_number: str | None = None
    aadhaar_number: str | None = None
    max_radius_km: int
    is_online: bool
    verification_status: VerificationStatus
    longitude: float | None = None
    latitude: float | None = None
    maps_url: str | None = None
    full_name: str | None = None
    location_label: str | None = None
    average_rating: float = 0
    rating_count: int = 0
    government_id_url: str | None = None
    business_reg_url: str | None = None
    aadhaar_doc_url: str | None = None
    gst_doc_url: str | None = None
    ekyc_photo_url: str | None = None
    ekyc_latitude: float | None = None
    ekyc_longitude: float | None = None
    ekyc_location_label: str | None = None
    ekyc_status: str | None = None
    ekyc_captured_at: datetime | None = None
    ekyc_video_requested_at: datetime | None = None

    model_config = {"from_attributes": True}


class AttachmentOut(BaseModel):
    id: UUID
    original_filename: str
    content_type: str
    size_bytes: int
    url: str
    request_id: UUID | None = None
    quote_id: UUID | None = None
    created_at: datetime
    is_image: bool = False
    is_pdf: bool = False


class ServiceRequestCreate(BaseModel):
    category_id: int
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=5)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    pincode: str | None = Field(default=None, max_length=12)
    search_radius_km: int | None = Field(default=None, ge=1, le=50)
    expires_in_minutes: int | None = Field(default=120, ge=15, le=1440)
    attachment_ids: list[UUID] = Field(default_factory=list)
    # Empty / omitted = broadcast nearby. Non-empty = send only to these provider user IDs.
    target_provider_ids: list[UUID] = Field(default_factory=list)


class ServiceRequestClose(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class ServiceRequestOut(BaseModel):
    id: UUID
    consumer_id: UUID
    category_id: int
    title: str
    description: str
    search_radius_km: int
    status: RequestStatus
    target_mode: RequestTargetMode = RequestTargetMode.BROADCAST
    target_provider_ids: list[UUID] = Field(default_factory=list)
    longitude: float | None = None
    latitude: float | None = None
    request_pincode: str | None = None
    expires_at: datetime | None
    created_at: datetime
    matched_provider_count: int | None = None
    attachments: list[AttachmentOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class QuoteCreate(BaseModel):
    request_id: UUID
    price_quote: float = Field(gt=0)
    estimated_days: int = Field(gt=0, le=365)
    message: str | None = None
    catalog_url: str | None = None
    attachment_ids: list[UUID] = Field(default_factory=list)


class QuoteUpdate(BaseModel):
    price_quote: float | None = Field(default=None, gt=0)
    estimated_days: int | None = Field(default=None, gt=0, le=365)
    message: str | None = None


class QuoteOut(BaseModel):
    id: UUID
    request_id: UUID
    provider_id: UUID
    price_quote: float
    currency: str
    estimated_days: int
    message: str | None
    catalog_url: str | None
    status: QuoteStatus
    created_at: datetime
    provider_name: str | None = None
    provider_rating: float | None = None
    request_title: str | None = None
    consumer_id: UUID | None = None
    consumer_name: str | None = None
    category_id: int | None = None
    provider_trust: ProviderTrustInfo | None = None
    attachments: list[AttachmentOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class OrderAccept(BaseModel):
    quote_id: UUID
    fulfillment_type: FulfillmentType
    payment_mode: PaymentMode = PaymentMode.CASH


class OrderComplete(BaseModel):
    otp: str = Field(min_length=6, max_length=6)


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderOut(BaseModel):
    id: UUID
    quote_id: UUID
    request_id: UUID
    consumer_id: UUID
    provider_id: UUID
    agreed_price: float
    fulfillment_type: FulfillmentType
    payment_mode: PaymentMode = PaymentMode.CASH
    status: OrderStatus
    completion_otp: str | None = None
    completed_at: datetime | None
    created_at: datetime
    request_title: str | None = None

    model_config = {"from_attributes": True}


class ChatMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class ChatMessageOut(BaseModel):
    id: UUID
    order_id: UUID
    sender_id: UUID
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RatingCreate(BaseModel):
    score: int = Field(ge=1, le=5)
    comment: str | None = None


class RatingOut(BaseModel):
    id: UUID
    order_id: UUID
    rater_id: UUID
    ratee_id: UUID
    score: int
    comment: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProviderVerify(BaseModel):
    verification_status: VerificationStatus


class AdminProviderOut(BaseModel):
    user_id: UUID
    full_name: str
    phone_number: str
    username: str
    email: str | None
    business_name: str
    category_id: int | None = None
    category_name: str | None = None
    categories: list[str] = Field(default_factory=list)
    offer_kind: OfferKind | None = None
    gst_number: str | None = None
    aadhaar_number: str | None = None
    aadhaar_doc_url: str | None = None
    verification_status: VerificationStatus
    is_online: bool
    is_active: bool
    average_rating: float
    rating_count: int
    latitude: float | None = None
    longitude: float | None = None
    location_label: str | None = None
    pincode: str | None = None
    maps_url: str | None = None
    created_at: datetime


class AdminProviderDetailOut(AdminProviderOut):
    public_slug: str | None = None
    public_url_path: str | None = None
    description: str | None = None
    offerings_detail: str | None = None
    website_url: str | None = None
    instagram_url: str | None = None
    youtube_url: str | None = None
    opening_time: str | None = None
    closing_time: str | None = None
    max_radius_km: int = 5
    alternate_phone: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    government_id_url: str | None = None
    business_reg_url: str | None = None
    gst_doc_url: str | None = None
    tax_id: str | None = None
    order_count: int = 0
    updated_at: datetime | None = None


class AdminProviderUpdate(BaseModel):
    """Admin edits for address/location, business profile, and verification fields."""

    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    email: EmailStr | None = None
    alternate_phone: str | None = Field(default=None, max_length=20)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    pincode: str | None = Field(default=None, max_length=12)
    location_label: str | None = Field(default=None, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    business_name: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    offerings_detail: str | None = None
    offer_kind: OfferKind | None = None
    website_url: str | None = None
    instagram_url: str | None = None
    youtube_url: str | None = None
    opening_time: str | None = None
    closing_time: str | None = None
    max_radius_km: int | None = Field(default=None, ge=1, le=50)
    tax_id: str | None = None
    gst_number: str | None = None
    aadhaar_number: str | None = Field(default=None, max_length=12)


class AdminProviderCreate(BaseModel):
    """Staff-created provider account (auto-approved)."""

    phone_number: str = Field(min_length=8, max_length=20)
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    email: EmailStr
    business_name: str = Field(min_length=2, max_length=255)
    category_ids: list[int] = Field(min_length=1)
    offer_kind: OfferKind = OfferKind.BOTH
    description: str | None = None
    offerings_detail: str | None = None
    gst_number: str | None = None
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    pincode: str | None = Field(default=None, max_length=12)
    location_label: str | None = Field(default=None, max_length=255)
    address_line1: str | None = Field(default=None, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    opening_time: str | None = None
    closing_time: str | None = None
    max_radius_km: int = Field(default=10, ge=1, le=50)
    approve: bool = True


class AdminCustomerServiceCreate(BaseModel):
    phone_number: str = Field(min_length=8, max_length=20)
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    email: EmailStr
    approve: bool = False


class AdminCustomerServiceOut(BaseModel):
    id: UUID
    phone_number: str
    email: str | None = None
    full_name: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    status: str  # PENDING | APPROVED | REVOKED


class AdminOrderOut(BaseModel):
    id: UUID
    quote_id: UUID
    request_id: UUID
    consumer_id: UUID
    provider_id: UUID
    consumer_name: str | None = None
    provider_name: str | None = None
    provider_business_name: str | None = None
    agreed_price: float
    fulfillment_type: FulfillmentType
    payment_mode: PaymentMode | None = None
    status: OrderStatus
    created_at: datetime
    completed_at: datetime | None = None


class AdminAnalyticsStatusBucket(BaseModel):
    status: str
    orders: int = 0
    gmv: float = 0.0


class AdminAnalyticsBucket(BaseModel):
    key: str
    label: str
    state: str | None = None
    city: str | None = None
    area: str | None = None
    pincode: str | None = None
    consumers: int = 0
    providers: int = 0
    orders: int = 0
    orders_completed: int = 0
    gmv: float = 0.0


class AdminAnalyticsFilterOptions(BaseModel):
    states: list[str] = Field(default_factory=list)
    cities: list[str] = Field(default_factory=list)
    areas: list[str] = Field(default_factory=list)
    pincodes: list[str] = Field(default_factory=list)


class AdminAnalyticsSummary(BaseModel):
    consumers: int = 0
    providers: int = 0
    orders: int = 0
    orders_completed: int = 0
    gmv: float = 0.0
    unknown_location: int = 0


class AdminAnalyticsTimelinePoint(BaseModel):
    date: str
    orders: int = 0
    completed: int = 0
    gmv: float = 0.0


class AdminAnalyticsOut(BaseModel):
    group_by: str
    location_of: str
    date_from: str | None = None
    date_to: str | None = None
    summary: AdminAnalyticsSummary
    status_breakdown: list[AdminAnalyticsStatusBucket] = Field(default_factory=list)
    buckets: list[AdminAnalyticsBucket] = Field(default_factory=list)
    timeline: list[AdminAnalyticsTimelinePoint] = Field(default_factory=list)
    filter_options: AdminAnalyticsFilterOptions = Field(
        default_factory=AdminAnalyticsFilterOptions
    )


class SmtpConfigOut(BaseModel):
    host: str
    port: int
    username: str | None = None
    password_set: bool = False
    from_email: str
    from_name: str
    use_tls: bool
    use_ssl: bool
    is_enabled: bool


class SmtpConfigUpdate(BaseModel):
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    username: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, max_length=255)
    from_email: EmailStr
    from_name: str = Field(default="Gharq", max_length=255)
    use_tls: bool = True
    use_ssl: bool = False
    is_enabled: bool = False


class SmtpTestRequest(BaseModel):
    to_email: EmailStr


class PublicSearchCategory(BaseModel):
    id: int
    name: str
    slug: str
    description: str | None = None
    kind: OfferKind
    parent_name: str | None = None


class PublicSearchOut(BaseModel):
    query: str
    categories: list[PublicSearchCategory] = Field(default_factory=list)
    providers: list[ProviderCatalogItem] = Field(default_factory=list)


class NearbyCategoryCount(BaseModel):
    category_id: int
    nearby_count: int


class NearbyCategoryCountsOut(BaseModel):
    radius_km: int
    counts: list[NearbyCategoryCount] = Field(default_factory=list)


CategoryOut.model_rebuild()
