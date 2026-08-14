import enum
import secrets
import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class UserRole(str, enum.Enum):
    CONSUMER = "CONSUMER"
    PROVIDER = "PROVIDER"
    ADMIN = "ADMIN"
    CUSTOMER_SERVICE = "CUSTOMER_SERVICE"


class VerificationStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    REVOKED = "REVOKED"


class RequestStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    FULFILLED = "FULFILLED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class QuoteStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    WITHDRAWN = "WITHDRAWN"


class FulfillmentType(str, enum.Enum):
    PROVIDER_DELIVERY = "PROVIDER_DELIVERY"
    CONSUMER_PICKUP = "CONSUMER_PICKUP"
    HOME_SERVICE = "HOME_SERVICE"


class PaymentMode(str, enum.Enum):
    CASH = "CASH"
    UPI = "UPI"
    CARD = "CARD"
    BANK_TRANSFER = "BANK_TRANSFER"
    OTHER = "OTHER"


class RequestTargetMode(str, enum.Enum):
    BROADCAST = "BROADCAST"
    TARGETED = "TARGETED"


class OrderStatus(str, enum.Enum):
    CONFIRMED = "CONFIRMED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    DISPUTED = "DISPUTED"
    REJECTED = "REJECTED"


class OfferKind(str, enum.Enum):
    PRODUCT = "PRODUCT"
    SERVICE = "SERVICE"
    BOTH = "BOTH"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    average_rating: Mapped[float] = mapped_column(Float, default=0.0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    # Optional home / operating location for profile display + Maps link
    location_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(12), nullable=True)
    alternate_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    provider_profile: Mapped["ProviderProfile | None"] = relationship(back_populates="user", uselist=False)
    service_requests: Mapped[list["ServiceRequest"]] = relationship(back_populates="consumer")
    quotes: Mapped[list["Quote"]] = relationship(back_populates="provider")
    conversations_as_consumer: Mapped[list["Conversation"]] = relationship(
        back_populates="consumer", foreign_keys="Conversation.consumer_id"
    )
    conversations_as_provider: Mapped[list["Conversation"]] = relationship(
        back_populates="provider", foreign_keys="Conversation.provider_id"
    )


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # What this category is intended for (admin hint)
    kind: Mapped[OfferKind] = mapped_column(
        Enum(OfferKind, name="offer_kind"), default=OfferKind.BOTH
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    parent: Mapped["Category | None"] = relationship(
        remote_side="Category.id", back_populates="children"
    )
    children: Mapped[list["Category"]] = relationship(back_populates="parent")


class ProviderProfile(Base):
    __tablename__ = "provider_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    business_name: Mapped[str] = mapped_column(String(255), nullable=False)
    public_slug: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True, index=True)
    # Legacy primary category kept for matching fallback; prefer provider_categories
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    offer_kind: Mapped[OfferKind] = mapped_column(
        Enum(OfferKind, name="offer_kind", create_type=False),
        default=OfferKind.BOTH,
    )
    offerings_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    instagram_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    youtube_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    opening_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # HH:MM
    closing_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    gst_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    aadhaar_number: Mapped[str | None] = mapped_column(String(12), nullable=True)
    # longitude/latitude stored as GEOGRAPHY(Point, 4326)
    base_location = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=True)
    max_radius_km: Mapped[int] = mapped_column(Integer, default=5)
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="verification_status"),
        default=VerificationStatus.PENDING,
    )
    government_id_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    business_reg_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    aadhaar_doc_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    gst_doc_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # eKYC — live photo + GPS + video session request with customer service
    ekyc_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ekyc_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    ekyc_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    ekyc_location_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ekyc_status: Mapped[str | None] = mapped_column(String(32), nullable=True, default="NONE")
    ekyc_captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ekyc_video_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="provider_profile")
    category: Mapped[Category | None] = relationship()
    category_links: Mapped[list["ProviderCategory"]] = relationship(
        back_populates="provider", cascade="all, delete-orphan"
    )


class ProviderCategory(Base):
    """Many-to-many: provider ↔ category or subcategory."""

    __tablename__ = "provider_categories"
    __table_args__ = (
        UniqueConstraint("provider_id", "category_id", name="uq_provider_category"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("provider_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )

    provider: Mapped[ProviderProfile] = relationship(back_populates="category_links")
    category: Mapped[Category] = relationship()


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    consumer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    request_location = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=True)
    request_pincode: Mapped[str | None] = mapped_column(String(12), nullable=True, index=True)
    search_radius_km: Mapped[int] = mapped_column(Integer, default=5)
    target_mode: Mapped[RequestTargetMode] = mapped_column(
        Enum(RequestTargetMode, name="request_target_mode"),
        default=RequestTargetMode.BROADCAST,
    )
    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus, name="request_status"), default=RequestStatus.ACTIVE, index=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    consumer: Mapped[User] = relationship(back_populates="service_requests")
    category: Mapped[Category] = relationship()
    quotes: Mapped[list["Quote"]] = relationship(back_populates="request", cascade="all, delete-orphan")
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="request", cascade="all, delete-orphan"
    )
    targets: Mapped[list["RequestTarget"]] = relationship(
        back_populates="request", cascade="all, delete-orphan"
    )


class RequestTarget(Base):
    """Explicit providers invited to a targeted request."""

    __tablename__ = "request_targets"
    __table_args__ = (
        UniqueConstraint("request_id", "provider_id", name="uq_request_target_provider"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    request: Mapped[ServiceRequest] = relationship(back_populates="targets")


class Quote(Base):
    __tablename__ = "quotes"
    __table_args__ = (UniqueConstraint("request_id", "provider_id", name="uq_quote_request_provider"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    price_quote: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    estimated_days: Mapped[int] = mapped_column(Integer, nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    catalog_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[QuoteStatus] = mapped_column(
        Enum(QuoteStatus, name="quote_status"), default=QuoteStatus.PENDING
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    request: Mapped[ServiceRequest] = relationship(back_populates="quotes")
    provider: Mapped[User] = relationship(back_populates="quotes")
    order: Mapped["Order | None"] = relationship(back_populates="quote", uselist=False)
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="quote", cascade="all, delete-orphan"
    )


class Attachment(Base):
    """Image or PDF attached to a service request (consumer) or quote (provider)."""

    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=True, index=True
    )
    quote_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped[ServiceRequest | None] = relationship(back_populates="attachments")
    quote: Mapped[Quote | None] = relationship(back_populates="attachments")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotes.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_requests.id"), nullable=False, index=True
    )
    consumer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    agreed_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    fulfillment_type: Mapped[FulfillmentType] = mapped_column(
        Enum(FulfillmentType, name="fulfillment_type"), nullable=False
    )
    payment_mode: Mapped[PaymentMode] = mapped_column(
        Enum(PaymentMode, name="payment_mode"),
        default=PaymentMode.CASH,
        nullable=False,
    )
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"), default=OrderStatus.CONFIRMED
    )
    completion_otp: Mapped[str] = mapped_column(String(6), default=lambda: f"{secrets.randbelow(10**6):06d}")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    quote: Mapped[Quote] = relationship(back_populates="order")
    messages: Mapped[list["ChatMessage"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    ratings: Mapped[list["Rating"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped[Order] = relationship(back_populates="messages")


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (UniqueConstraint("order_id", "rater_id", name="uq_rating_order_rater"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    rater_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    ratee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped[Order] = relationship(back_populates="ratings")


class Conversation(Base):
    """Pre-request inquiry chat between a consumer and a provider."""

    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("consumer_id", "provider_id", name="uq_conversation_consumer_provider"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    consumer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    consumer_last_read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    provider_last_read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    consumer: Mapped[User] = relationship(
        back_populates="conversations_as_consumer", foreign_keys=[consumer_id]
    )
    provider: Mapped[User] = relationship(
        back_populates="conversations_as_provider", foreign_keys=[provider_id]
    )
    messages: Mapped[list["InquiryMessage"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class InquiryMessage(Base):
    __tablename__ = "inquiry_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class AdminConversation(Base):
    """Support thread between Gharq admins and a provider (one per provider)."""

    __tablename__ = "admin_conversations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    created_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    provider_last_read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    admin_last_read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    messages: Mapped[list["AdminMessage"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class AdminMessage(Base):
    __tablename__ = "admin_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("admin_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[AdminConversation] = relationship(back_populates="messages")


class AppSmtpConfig(Base):
    """Singleton SMTP settings configured by admin for transactional email."""

    __tablename__ = "app_smtp_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    host: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    port: Mapped[int] = mapped_column(Integer, nullable=False, default=587)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    from_email: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    from_name: Mapped[str] = mapped_column(String(255), nullable=False, default="Gharq")
    use_tls: Mapped[bool] = mapped_column(Boolean, default=True)
    use_ssl: Mapped[bool] = mapped_column(Boolean, default=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
