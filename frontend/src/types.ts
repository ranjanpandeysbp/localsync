export type UserRole = "CONSUMER" | "PROVIDER" | "ADMIN" | "CUSTOMER_SERVICE";

export function isStaffRole(role?: UserRole | null): boolean {
  return role === "ADMIN" || role === "CUSTOMER_SERVICE";
}

export function roleHome(role: UserRole): string {
  if (role === "PROVIDER") return "/provider/overview";
  if (isStaffRole(role)) return "/admin/providers";
  return "/consumer/details";
}
export type OfferKind = "PRODUCT" | "SERVICE" | "BOTH";

export interface User {
  id: string;
  role: UserRole;
  phone_number: string;
  username?: string;
  email: string | null;
  full_name: string;
  is_active: boolean;
  is_verified: boolean;
  average_rating: number;
  rating_count: number;
  created_at: string;
  location_label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  maps_url?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  alternate_phone?: string | null;
  profile_complete?: boolean;
  verification_status?: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED" | null;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  parent_id?: number | null;
  kind?: OfferKind;
  is_active: boolean;
  children?: Category[];
}

export interface CategoryTree {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  kind: OfferKind;
  is_active: boolean;
  subcategories: Category[];
}

export interface NearbyCategoryCounts {
  radius_km: number;
  counts: { category_id: number; nearby_count: number }[];
}

export interface ProviderTrustInfo {
  business_name: string;
  full_name?: string | null;
  offer_kind?: OfferKind | null;
  description?: string | null;
  offerings_detail?: string | null;
  opening_time?: string | null;
  closing_time?: string | null;
  gst_number?: string | null;
  average_rating: number;
  rating_count: number;
  categories: string[];
  maps_url?: string | null;
  location_label?: string | null;
  is_online?: boolean | null;
  verification_status?: string | null;
}

export interface ProviderProfile {
  id: string;
  user_id: string;
  business_name: string;
  public_slug?: string | null;
  public_url_path?: string | null;
  category_id: number | null;
  category_ids?: number[];
  categories?: string[];
  description: string | null;
  offer_kind?: OfferKind;
  offerings_detail?: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
  opening_time?: string | null;
  closing_time?: string | null;
  gst_number?: string | null;
  aadhaar_number?: string | null;
  max_radius_km: number;
  is_online: boolean;
  verification_status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  longitude: number | null;
  latitude: number | null;
  maps_url?: string | null;
  full_name?: string | null;
  location_label?: string | null;
  average_rating?: number;
  rating_count?: number;
  government_id_url?: string | null;
  business_reg_url?: string | null;
  aadhaar_doc_url?: string | null;
  gst_doc_url?: string | null;
}

export interface ProviderCatalogItem {
  user_id: string;
  full_name: string;
  business_name: string;
  public_slug?: string | null;
  public_url_path?: string | null;
  category_id: number | null;
  category_name: string | null;
  categories?: string[];
  description: string | null;
  offerings_detail?: string | null;
  offer_kind?: OfferKind | null;
  opening_time?: string | null;
  closing_time?: string | null;
  gst_number?: string | null;
  is_online: boolean;
  verification_status: string;
  average_rating: number;
  rating_count: number;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  maps_url: string | null;
  max_radius_km: number;
}

export interface ProviderPublicProfile {
  user_id: string;
  business_name: string;
  public_slug?: string | null;
  full_name: string | null;
  description: string | null;
  offerings_detail: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
  offer_kind: OfferKind;
  categories: string[];
  opening_time: string | null;
  closing_time: string | null;
  gst_number: string | null;
  is_online: boolean;
  verification_status: string;
  average_rating: number;
  rating_count: number;
  max_radius_km: number;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  maps_url: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  public_url_path: string;
}

export interface PublicSearchCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  kind: OfferKind;
  parent_name: string | null;
}

export interface PublicSearchResult {
  query: string;
  categories: PublicSearchCategory[];
  providers: ProviderCatalogItem[];
}

export interface SmtpConfig {
  host: string;
  port: number;
  username: string | null;
  password_set: boolean;
  from_email: string;
  from_name: string;
  use_tls: boolean;
  use_ssl: boolean;
  is_enabled: boolean;
}

export interface Attachment {
  id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  url: string;
  request_id?: string | null;
  quote_id?: string | null;
  created_at: string;
  is_image?: boolean;
  is_pdf?: boolean;
}

export interface ServiceRequest {
  id: string;
  consumer_id: string;
  category_id: number;
  title: string;
  description: string;
  search_radius_km: number;
  status: "ACTIVE" | "FULFILLED" | "EXPIRED" | "CANCELLED";
  target_mode?: "BROADCAST" | "TARGETED";
  target_provider_ids?: string[];
  longitude: number | null;
  latitude: number | null;
  request_pincode?: string | null;
  expires_at: string | null;
  created_at: string;
  matched_provider_count?: number | null;
  attachments?: Attachment[];
}

export interface Quote {
  id: string;
  request_id: string;
  provider_id: string;
  price_quote: number;
  currency: string;
  estimated_days: number;
  message: string | null;
  catalog_url: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  created_at: string;
  provider_name?: string | null;
  provider_rating?: number | null;
  request_title?: string | null;
  consumer_name?: string | null;
  provider_trust?: ProviderTrustInfo | null;
  attachments?: Attachment[];
}

export interface Order {
  id: string;
  quote_id: string;
  request_id: string;
  consumer_id: string;
  provider_id: string;
  agreed_price: number;
  fulfillment_type: "PROVIDER_DELIVERY" | "CONSUMER_PICKUP" | "HOME_SERVICE";
  payment_mode?: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER";
  status: "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "DISPUTED";
  completion_otp: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AdminProvider {
  user_id: string;
  full_name: string;
  phone_number: string;
  username?: string;
  email: string | null;
  business_name: string;
  category_id: number | null;
  category_name: string | null;
  categories?: string[];
  offer_kind?: OfferKind | null;
  gst_number?: string | null;
  aadhaar_number?: string | null;
  aadhaar_doc_url?: string | null;
  verification_status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  is_online: boolean;
  is_active: boolean;
  average_rating: number;
  rating_count: number;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  pincode?: string | null;
  maps_url: string | null;
  created_at: string;
}

export interface AdminProviderDetail extends AdminProvider {
  public_slug?: string | null;
  public_url_path?: string | null;
  description?: string | null;
  offerings_detail?: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
  opening_time?: string | null;
  closing_time?: string | null;
  max_radius_km: number;
  alternate_phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  government_id_url?: string | null;
  business_reg_url?: string | null;
  gst_doc_url?: string | null;
  tax_id?: string | null;
  order_count: number;
  updated_at?: string | null;
}

export interface AdminOrder {
  id: string;
  quote_id: string;
  request_id: string;
  consumer_id: string;
  provider_id: string;
  consumer_name: string | null;
  provider_name: string | null;
  provider_business_name: string | null;
  agreed_price: number;
  fulfillment_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export type AdminAnalyticsGroupBy = "state" | "city" | "area" | "pincode";
export type AdminAnalyticsLocationOf = "consumer" | "provider";

export interface AdminAnalyticsBucket {
  key: string;
  label: string;
  state?: string | null;
  city?: string | null;
  area?: string | null;
  pincode?: string | null;
  consumers: number;
  providers: number;
  orders: number;
  orders_completed: number;
  gmv: number;
}

export interface AdminAnalyticsStatusBucket {
  status: string;
  orders: number;
  gmv: number;
}

export interface AdminAnalyticsFilterOptions {
  states: string[];
  cities: string[];
  areas: string[];
  pincodes: string[];
}

export interface AdminAnalyticsSummary {
  consumers: number;
  providers: number;
  orders: number;
  orders_completed: number;
  gmv: number;
  unknown_location: number;
}

export interface AdminAnalyticsTimelinePoint {
  date: string;
  orders: number;
  completed: number;
  gmv: number;
}

export interface AdminAnalytics {
  group_by: AdminAnalyticsGroupBy;
  location_of: AdminAnalyticsLocationOf;
  date_from?: string | null;
  date_to?: string | null;
  summary: AdminAnalyticsSummary;
  status_breakdown: AdminAnalyticsStatusBucket[];
  buckets: AdminAnalyticsBucket[];
  timeline: AdminAnalyticsTimelinePoint[];
  filter_options: AdminAnalyticsFilterOptions;
}

export interface ChatMessage {
  id: string;
  order_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface AdminCustomerServiceAgent {
  id: string;
  phone_number: string;
  email: string | null;
  full_name: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  status: "PENDING" | "APPROVED" | "REVOKED" | string;
}

export interface Conversation {
  id: string;
  consumer_id: string;
  provider_id: string;
  category_id: number | null;
  created_at: string;
  updated_at: string;
  consumer_name?: string | null;
  provider_name?: string | null;
  provider_business_name?: string | null;
  provider_is_online?: boolean | null;
  last_message?: string | null;
}

export interface InquiryMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface AdminSupportConversation {
  id: string;
  provider_id: string;
  created_by_admin_id?: string | null;
  created_at: string;
  updated_at: string;
  provider_name?: string | null;
  provider_business_name?: string | null;
  admin_name?: string | null;
  last_message?: string | null;
  unread_count?: number;
  provider_message_count?: number;
}
