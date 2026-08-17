--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg110+2)
-- Dumped by pg_dump version 16.4 (Debian 16.4-1.pgdg110+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- KoshalHaat / localsync public-schema snapshot (schema + data).
-- SMTP config rows omitted. Do not DROP SCHEMA public (PostGIS lives there).
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

ALTER TABLE IF EXISTS ONLY public.service_requests DROP CONSTRAINT IF EXISTS service_requests_consumer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.service_requests DROP CONSTRAINT IF EXISTS service_requests_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.request_targets DROP CONSTRAINT IF EXISTS request_targets_request_id_fkey;
ALTER TABLE IF EXISTS ONLY public.request_targets DROP CONSTRAINT IF EXISTS request_targets_provider_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ratings DROP CONSTRAINT IF EXISTS ratings_rater_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ratings DROP CONSTRAINT IF EXISTS ratings_ratee_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ratings DROP CONSTRAINT IF EXISTS ratings_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.quotes DROP CONSTRAINT IF EXISTS quotes_request_id_fkey;
ALTER TABLE IF EXISTS ONLY public.quotes DROP CONSTRAINT IF EXISTS quotes_provider_id_fkey;
ALTER TABLE IF EXISTS ONLY public.provider_profiles DROP CONSTRAINT IF EXISTS provider_profiles_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.provider_profiles DROP CONSTRAINT IF EXISTS provider_profiles_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.provider_categories DROP CONSTRAINT IF EXISTS provider_categories_provider_id_fkey;
ALTER TABLE IF EXISTS ONLY public.provider_categories DROP CONSTRAINT IF EXISTS provider_categories_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_request_id_fkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_quote_id_fkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_provider_id_fkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_consumer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.inquiry_messages DROP CONSTRAINT IF EXISTS inquiry_messages_sender_id_fkey;
ALTER TABLE IF EXISTS ONLY public.inquiry_messages DROP CONSTRAINT IF EXISTS inquiry_messages_conversation_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_provider_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_consumer_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_order_id_fkey;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_parent_id_fkey;
ALTER TABLE IF EXISTS ONLY public.attachments DROP CONSTRAINT IF EXISTS attachments_uploaded_by_fkey;
ALTER TABLE IF EXISTS ONLY public.attachments DROP CONSTRAINT IF EXISTS attachments_request_id_fkey;
ALTER TABLE IF EXISTS ONLY public.attachments DROP CONSTRAINT IF EXISTS attachments_quote_id_fkey;
ALTER TABLE IF EXISTS ONLY public.admin_messages DROP CONSTRAINT IF EXISTS admin_messages_sender_id_fkey;
ALTER TABLE IF EXISTS ONLY public.admin_messages DROP CONSTRAINT IF EXISTS admin_messages_conversation_id_fkey;
ALTER TABLE IF EXISTS ONLY public.admin_conversations DROP CONSTRAINT IF EXISTS admin_conversations_provider_id_fkey;
ALTER TABLE IF EXISTS ONLY public.admin_conversations DROP CONSTRAINT IF EXISTS admin_conversations_created_by_admin_id_fkey;
DROP INDEX IF EXISTS public.uq_provider_profiles_public_slug;
DROP INDEX IF EXISTS public.ix_users_phone_number;
DROP INDEX IF EXISTS public.ix_service_requests_status;
DROP INDEX IF EXISTS public.ix_service_requests_request_pincode;
DROP INDEX IF EXISTS public.ix_service_requests_consumer_id;
DROP INDEX IF EXISTS public.ix_request_targets_request_id;
DROP INDEX IF EXISTS public.ix_request_targets_provider_id;
DROP INDEX IF EXISTS public.ix_quotes_request_id;
DROP INDEX IF EXISTS public.ix_quotes_provider_id;
DROP INDEX IF EXISTS public.ix_provider_categories_provider_id;
DROP INDEX IF EXISTS public.ix_provider_categories_category_id;
DROP INDEX IF EXISTS public.ix_orders_request_id;
DROP INDEX IF EXISTS public.ix_orders_provider_id;
DROP INDEX IF EXISTS public.ix_orders_consumer_id;
DROP INDEX IF EXISTS public.ix_inquiry_messages_conversation_id;
DROP INDEX IF EXISTS public.ix_conversations_provider_id;
DROP INDEX IF EXISTS public.ix_conversations_consumer_id;
DROP INDEX IF EXISTS public.ix_chat_messages_order_id;
DROP INDEX IF EXISTS public.ix_categories_parent_id;
DROP INDEX IF EXISTS public.ix_attachments_uploaded_by;
DROP INDEX IF EXISTS public.ix_attachments_request_id;
DROP INDEX IF EXISTS public.ix_attachments_quote_id;
DROP INDEX IF EXISTS public.ix_admin_messages_conversation_id;
DROP INDEX IF EXISTS public.ix_admin_conversations_provider_id;
DROP INDEX IF EXISTS public.idx_service_requests_request_location;
DROP INDEX IF EXISTS public.idx_request_location;
DROP INDEX IF EXISTS public.idx_provider_profiles_base_location;
DROP INDEX IF EXISTS public.idx_provider_location;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE IF EXISTS ONLY public.request_targets DROP CONSTRAINT IF EXISTS uq_request_target_provider;
ALTER TABLE IF EXISTS ONLY public.ratings DROP CONSTRAINT IF EXISTS uq_rating_order_rater;
ALTER TABLE IF EXISTS ONLY public.quotes DROP CONSTRAINT IF EXISTS uq_quote_request_provider;
ALTER TABLE IF EXISTS ONLY public.provider_categories DROP CONSTRAINT IF EXISTS uq_provider_category;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS uq_conversation_consumer_provider;
ALTER TABLE IF EXISTS ONLY public.service_requests DROP CONSTRAINT IF EXISTS service_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.request_targets DROP CONSTRAINT IF EXISTS request_targets_pkey;
ALTER TABLE IF EXISTS ONLY public.ratings DROP CONSTRAINT IF EXISTS ratings_pkey;
ALTER TABLE IF EXISTS ONLY public.quotes DROP CONSTRAINT IF EXISTS quotes_pkey;
ALTER TABLE IF EXISTS ONLY public.provider_profiles DROP CONSTRAINT IF EXISTS provider_profiles_user_id_key;
ALTER TABLE IF EXISTS ONLY public.provider_profiles DROP CONSTRAINT IF EXISTS provider_profiles_pkey;
ALTER TABLE IF EXISTS ONLY public.provider_categories DROP CONSTRAINT IF EXISTS provider_categories_pkey;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_quote_id_key;
ALTER TABLE IF EXISTS ONLY public.orders DROP CONSTRAINT IF EXISTS orders_pkey;
ALTER TABLE IF EXISTS ONLY public.inquiry_messages DROP CONSTRAINT IF EXISTS inquiry_messages_pkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_pkey;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_pkey;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_slug_key;
ALTER TABLE IF EXISTS ONLY public.categories DROP CONSTRAINT IF EXISTS categories_pkey;
ALTER TABLE IF EXISTS ONLY public.attachments DROP CONSTRAINT IF EXISTS attachments_stored_name_key;
ALTER TABLE IF EXISTS ONLY public.attachments DROP CONSTRAINT IF EXISTS attachments_pkey;
ALTER TABLE IF EXISTS ONLY public.app_smtp_config DROP CONSTRAINT IF EXISTS app_smtp_config_pkey;
ALTER TABLE IF EXISTS ONLY public.admin_messages DROP CONSTRAINT IF EXISTS admin_messages_pkey;
ALTER TABLE IF EXISTS ONLY public.admin_conversations DROP CONSTRAINT IF EXISTS admin_conversations_pkey;
ALTER TABLE IF EXISTS public.request_targets ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.provider_categories ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.categories ALTER COLUMN id DROP DEFAULT;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.service_requests;
DROP SEQUENCE IF EXISTS public.request_targets_id_seq;
DROP TABLE IF EXISTS public.request_targets;
DROP TABLE IF EXISTS public.ratings;
DROP TABLE IF EXISTS public.quotes;
DROP TABLE IF EXISTS public.provider_profiles;
DROP SEQUENCE IF EXISTS public.provider_categories_id_seq;
DROP TABLE IF EXISTS public.provider_categories;
DROP TABLE IF EXISTS public.orders;
DROP TABLE IF EXISTS public.inquiry_messages;
DROP TABLE IF EXISTS public.conversations;
DROP TABLE IF EXISTS public.chat_messages;
DROP SEQUENCE IF EXISTS public.categories_id_seq;
DROP TABLE IF EXISTS public.categories;
DROP TABLE IF EXISTS public.attachments;
DROP TABLE IF EXISTS public.app_smtp_config;
DROP TABLE IF EXISTS public.admin_messages;
DROP TABLE IF EXISTS public.admin_conversations;
DROP TYPE IF EXISTS public.verification_status;
DROP TYPE IF EXISTS public.user_role;
DROP TYPE IF EXISTS public.request_target_mode;
DROP TYPE IF EXISTS public.request_status;
DROP TYPE IF EXISTS public.quote_status;
DROP TYPE IF EXISTS public.payment_mode;
DROP TYPE IF EXISTS public.order_status;
DROP TYPE IF EXISTS public.offer_kind;
DROP TYPE IF EXISTS public.fulfillment_type;



--
-- Name: fulfillment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fulfillment_type AS ENUM (
    'PROVIDER_DELIVERY',
    'CONSUMER_PICKUP',
    'HOME_SERVICE'
);


--
-- Name: offer_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.offer_kind AS ENUM (
    'PRODUCT',
    'SERVICE',
    'BOTH'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'CONFIRMED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'DISPUTED',
    'REJECTED'
);


--
-- Name: payment_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_mode AS ENUM (
    'CASH',
    'UPI',
    'CARD',
    'BANK_TRANSFER',
    'OTHER'
);


--
-- Name: quote_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.quote_status AS ENUM (
    'PENDING',
    'ACCEPTED',
    'REJECTED',
    'WITHDRAWN'
);


--
-- Name: request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_status AS ENUM (
    'ACTIVE',
    'FULFILLED',
    'EXPIRED',
    'CANCELLED'
);


--
-- Name: request_target_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_target_mode AS ENUM (
    'BROADCAST',
    'TARGETED'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'CONSUMER',
    'PROVIDER',
    'ADMIN',
    'CUSTOMER_SERVICE'
);


--
-- Name: verification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.verification_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'REVOKED'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_conversations (
    id uuid NOT NULL,
    provider_id uuid NOT NULL,
    created_by_admin_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_last_read_at timestamp with time zone,
    admin_last_read_at timestamp with time zone
);


--
-- Name: admin_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_messages (
    id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_smtp_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_smtp_config (
    id integer NOT NULL,
    host character varying(255) NOT NULL,
    port integer NOT NULL,
    username character varying(255),
    password character varying(255),
    from_email character varying(255) NOT NULL,
    from_name character varying(255) NOT NULL,
    use_tls boolean NOT NULL,
    use_ssl boolean NOT NULL,
    is_enabled boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id uuid NOT NULL,
    uploaded_by uuid NOT NULL,
    original_filename character varying(255) NOT NULL,
    content_type character varying(100) NOT NULL,
    stored_name character varying(255) NOT NULL,
    size_bytes integer NOT NULL,
    request_id uuid,
    quote_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    parent_id integer,
    kind public.offer_kind NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid NOT NULL,
    order_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid NOT NULL,
    consumer_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    category_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    consumer_last_read_at timestamp with time zone,
    provider_last_read_at timestamp with time zone
);


--
-- Name: inquiry_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inquiry_messages (
    id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid NOT NULL,
    quote_id uuid NOT NULL,
    request_id uuid NOT NULL,
    consumer_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    agreed_price numeric(12,2) NOT NULL,
    fulfillment_type public.fulfillment_type NOT NULL,
    payment_mode public.payment_mode NOT NULL,
    status public.order_status NOT NULL,
    completion_otp character varying(6) NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: provider_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_categories (
    id integer NOT NULL,
    provider_id uuid NOT NULL,
    category_id integer NOT NULL
);


--
-- Name: provider_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.provider_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: provider_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.provider_categories_id_seq OWNED BY public.provider_categories.id;


--
-- Name: provider_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.provider_profiles (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    business_name character varying(255) NOT NULL,
    category_id integer,
    description text,
    offer_kind public.offer_kind NOT NULL,
    offerings_detail text,
    website_url character varying(500),
    instagram_url character varying(500),
    youtube_url character varying(500),
    opening_time character varying(5),
    closing_time character varying(5),
    gst_number character varying(30),
    aadhaar_number character varying(12),
    base_location public.geography(Point,4326),
    max_radius_km integer NOT NULL,
    is_online boolean NOT NULL,
    verification_status public.verification_status NOT NULL,
    government_id_url character varying(500),
    business_reg_url character varying(500),
    aadhaar_doc_url character varying(500),
    gst_doc_url character varying(500),
    tax_id character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    public_slug character varying(100),
    ekyc_photo_url character varying(500),
    ekyc_latitude double precision,
    ekyc_longitude double precision,
    ekyc_location_label character varying(255),
    ekyc_status character varying(32),
    ekyc_captured_at timestamp with time zone,
    ekyc_video_requested_at timestamp with time zone
);


--
-- Name: quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotes (
    id uuid NOT NULL,
    request_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    price_quote numeric(12,2) NOT NULL,
    currency character varying(3) NOT NULL,
    estimated_days integer NOT NULL,
    message text,
    catalog_url character varying(500),
    status public.quote_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    consumer_seen_at timestamp with time zone
);


--
-- Name: ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ratings (
    id uuid NOT NULL,
    order_id uuid NOT NULL,
    rater_id uuid NOT NULL,
    ratee_id uuid NOT NULL,
    score integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: request_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_targets (
    id integer NOT NULL,
    request_id uuid NOT NULL,
    provider_id uuid NOT NULL
);


--
-- Name: request_targets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.request_targets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: request_targets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.request_targets_id_seq OWNED BY public.request_targets.id;


--
-- Name: service_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_requests (
    id uuid NOT NULL,
    consumer_id uuid NOT NULL,
    category_id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    request_location public.geography(Point,4326),
    request_pincode character varying(12),
    search_radius_km integer NOT NULL,
    target_mode public.request_target_mode NOT NULL,
    status public.request_status NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    role public.user_role NOT NULL,
    phone_number character varying(20) NOT NULL,
    email character varying(255),
    full_name character varying(255) NOT NULL,
    hashed_password character varying(255) NOT NULL,
    is_active boolean NOT NULL,
    is_verified boolean NOT NULL,
    average_rating double precision NOT NULL,
    rating_count integer NOT NULL,
    location_label character varying(255),
    latitude double precision,
    longitude double precision,
    address_line1 character varying(255),
    address_line2 character varying(255),
    city character varying(100),
    state character varying(100),
    pincode character varying(12),
    alternate_phone character varying(20),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: provider_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_categories ALTER COLUMN id SET DEFAULT nextval('public.provider_categories_id_seq'::regclass);


--
-- Name: request_targets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_targets ALTER COLUMN id SET DEFAULT nextval('public.request_targets_id_seq'::regclass);


--
-- Data for Name: admin_conversations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_conversations (id, provider_id, created_by_admin_id, created_at, updated_at, provider_last_read_at, admin_last_read_at) FROM stdin;
bf74e4f8-77ec-4795-9641-ef4f0d1d7960	7870aff3-900b-4388-9525-1a2105eed073	015eb23c-4ba2-410c-bf44-f6d2434bbb32	2026-08-08 10:09:53.425521+00	2026-08-14 09:15:20.033904+00	2026-08-14 09:15:20.043515+00	2026-08-11 09:47:09.628883+00
6bd71028-d4eb-4cf5-ac4b-2c7cd261e2dc	ba5f1bb2-b208-4b24-9a52-570f8f68e394	015eb23c-4ba2-410c-bf44-f6d2434bbb32	2026-08-16 12:11:11.650234+00	2026-08-16 12:11:14.897953+00	\N	2026-08-16 12:11:14.914827+00
3beb5e17-b128-47f6-893d-70db41da7cc5	dc082189-6ab5-4dc0-9a72-8e539e75b6ea	015eb23c-4ba2-410c-bf44-f6d2434bbb32	2026-08-08 10:16:34.332145+00	2026-08-13 10:03:59.292991+00	2026-08-13 10:03:59.305092+00	2026-08-12 10:26:29.531899+00
\.


--
-- Data for Name: admin_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_messages (id, conversation_id, sender_id, body, created_at) FROM stdin;
b7254b35-f30f-491e-828e-cd634bedebad	bf74e4f8-77ec-4795-9641-ef4f0d1d7960	015eb23c-4ba2-410c-bf44-f6d2434bbb32	hi complete your profile.	2026-08-08 10:09:53.425521+00
69359199-befe-40f6-aab7-3a8a688bdec2	bf74e4f8-77ec-4795-9641-ef4f0d1d7960	015eb23c-4ba2-410c-bf44-f6d2434bbb32	profile missing details on dnbsvbs	2026-08-08 10:10:13.316553+00
1a6864e1-f611-4bf5-a9b5-068cd40cc015	bf74e4f8-77ec-4795-9641-ef4f0d1d7960	015eb23c-4ba2-410c-bf44-f6d2434bbb32	hi can you update	2026-08-08 10:19:50.933174+00
7c461e76-245d-4bf1-b9bd-c4179e4bbb63	bf74e4f8-77ec-4795-9641-ef4f0d1d7960	7870aff3-900b-4388-9525-1a2105eed073	yes i will update them	2026-08-08 10:21:14.821319+00
69dfc2aa-8420-4943-bc7f-53db33c23745	bf74e4f8-77ec-4795-9641-ef4f0d1d7960	015eb23c-4ba2-410c-bf44-f6d2434bbb32	Your provider account has been revoked by LokaCart admin. You can still open Overview, update My profile, and reply in Admin messages. Requests, quotes, orders, and consumer inquiries are unavailable until you are re-approved.	2026-08-10 09:24:05.481921+00
ea844a1d-1b19-4f5d-b2d3-68eeed5cc874	bf74e4f8-77ec-4795-9641-ef4f0d1d7960	015eb23c-4ba2-410c-bf44-f6d2434bbb32	Your provider account has been revoked by LokaCart admin. You can still open Overview, update My profile, and reply in Admin messages. Requests, quotes, orders, and consumer inquiries are unavailable until you are re-approved.	2026-08-11 09:47:03.176083+00
df954b8c-5820-4a48-89ff-a680d607e317	bf74e4f8-77ec-4795-9641-ef4f0d1d7960	015eb23c-4ba2-410c-bf44-f6d2434bbb32	Your provider account has been re-approved by LokaCart admin. Marketplace features are available again — you can go online, receive requests, send quotes, and chat with consumers.	2026-08-11 09:47:07.428673+00
8de2fc6c-15da-4a68-88f6-95eed8275747	3beb5e17-b128-47f6-893d-70db41da7cc5	015eb23c-4ba2-410c-bf44-f6d2434bbb32	hi	2026-08-12 10:26:29.045739+00
\.


--
-- Data for Name: attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attachments (id, uploaded_by, original_filename, content_type, stored_name, size_bytes, request_id, quote_id, created_at) FROM stdin;
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, name, slug, description, parent_id, kind, is_active, created_at) FROM stdin;
1	Plumbing	plumbing	Local plumbers and pipe repairs	\N	SERVICE	t	2026-08-05 05:53:14.539314+00
2	Leak repair	plumbing-leak-repair	Fix leaks and dripping taps	1	SERVICE	t	2026-08-05 05:53:14.539314+00
3	Pipe fitting	plumbing-pipe-fitting	New pipe installation	1	SERVICE	t	2026-08-05 05:53:14.539314+00
10	Electrical	electrical	Electricians and wiring	\N	SERVICE	t	2026-08-05 05:53:14.539314+00
11	Wiring	electrical-wiring	Home wiring and switches	10	SERVICE	t	2026-08-05 05:53:14.539314+00
12	Cleaning	cleaning	Home and office cleaning	\N	SERVICE	t	2026-08-05 05:53:14.539314+00
13	Deep clean	cleaning-deep	Full home deep cleaning	12	SERVICE	t	2026-08-05 05:53:14.539314+00
14	Carpentry	carpentry	Furniture and woodwork	\N	BOTH	t	2026-08-05 05:53:14.539314+00
15	Custom furniture	carpentry-furniture	Made-to-order furniture	14	PRODUCT	t	2026-08-05 05:53:14.539314+00
16	Grocery, Produce & Staples	grocery-produce-staples	Fresh produce, staples, and wholesale supplies for homes, Kirana stores, and restaurants.	\N	PRODUCT	t	2026-08-16 11:38:17.707417+00
19	Building Materials, Hardware & Electricals	building-materials-hardware-electricals	Cement, hardware, electricals, and DIY materials for trade and home use.	\N	PRODUCT	t	2026-08-16 11:38:17.707417+00
22	Electronics, Appliances & Mobile Accessories	electronics-appliances-mobile	Consumer electronics, appliances, and wholesale IT or mobile accessories.	\N	PRODUCT	t	2026-08-16 11:38:17.707417+00
25	Apparel, Textiles & Packaging Supplies	apparel-textiles-packaging	Clothing, fabrics, and packaging supplies for shops and manufacturers.	\N	PRODUCT	t	2026-08-16 11:38:17.707417+00
28	Medical, Hygiene & Safety Essentials	medical-hygiene-safety	Medical consumables, hygiene products, and safety gear for clinics and homes.	\N	PRODUCT	t	2026-08-16 11:38:17.707417+00
31	Home & Office Maintenance	home-office-maintenance	Repair, cleaning, and facility maintenance for homes and workplaces.	\N	SERVICE	t	2026-08-16 11:38:17.707417+00
34	Logistics, Delivery & Fleet Services	logistics-delivery-fleet	Local delivery, shifting, and fleet hire for businesses and households.	\N	SERVICE	t	2026-08-16 11:38:17.707417+00
37	Professional & Business Services	professional-business-services	Accounting, legal, IT, and local professional help for businesses and individuals.	\N	SERVICE	t	2026-08-16 11:38:17.707417+00
40	Event Management, Catering & Media	event-management-catering-media	Catering, events, photography, and AV for corporate and personal occasions.	\N	BOTH	t	2026-08-16 11:38:17.707417+00
43	Personal Care, Beauty & Wellness	personal-care-beauty-wellness	Salon supplies, at-home beauty, fitness, and wellness services.	\N	BOTH	t	2026-08-16 11:38:17.707417+00
46	Bulk grains	grocery-produce-staples-bulk-grains	\N	16	PRODUCT	t	2026-08-16 11:56:46.434075+00
47	Commercial oil cans	grocery-produce-staples-commercial-oil-cans	\N	16	PRODUCT	t	2026-08-16 11:56:46.434075+00
48	Wholesale spices	grocery-produce-staples-wholesale-spices	\N	16	PRODUCT	t	2026-08-16 11:56:46.434075+00
49	Farm-direct produce crates for restaurants and Kirana stores	grocery-produce-staples-farm-direct-produce-crates-for-restaurants-and-kirana-stores	\N	16	PRODUCT	t	2026-08-16 11:56:46.434075+00
50	Fresh fruits	grocery-produce-staples-fresh-fruits	\N	16	PRODUCT	t	2026-08-16 11:56:46.434075+00
51	Vegetables	grocery-produce-staples-vegetables	\N	16	PRODUCT	t	2026-08-16 11:56:46.434075+00
52	Daily dairy	grocery-produce-staples-daily-dairy	\N	16	PRODUCT	t	2026-08-16 11:56:46.434075+00
53	Organic packaged foods	grocery-produce-staples-organic-packaged-foods	\N	16	PRODUCT	t	2026-08-16 11:56:46.434075+00
54	Bakery items	grocery-produce-staples-bakery-items	\N	16	PRODUCT	t	2026-08-16 11:56:46.434075+00
55	Cement	building-materials-hardware-electricals-cement	\N	19	PRODUCT	t	2026-08-16 11:56:46.434075+00
56	TMT steel bars	building-materials-hardware-electricals-tmt-steel-bars	\N	19	PRODUCT	t	2026-08-16 11:56:46.434075+00
57	Electrical conduit pipes	building-materials-hardware-electricals-electrical-conduit-pipes	\N	19	PRODUCT	t	2026-08-16 11:56:46.434075+00
58	Bulk wiring spools	building-materials-hardware-electricals-bulk-wiring-spools	\N	19	PRODUCT	t	2026-08-16 11:56:46.434075+00
59	Commercial lighting fixtures	building-materials-hardware-electricals-commercial-lighting-fixtures	\N	19	PRODUCT	t	2026-08-16 11:56:46.434075+00
60	Tiles	building-materials-hardware-electricals-tiles	\N	19	PRODUCT	t	2026-08-16 11:56:46.434075+00
61	DIY toolkits	building-materials-hardware-electricals-diy-toolkits	\N	19	PRODUCT	t	2026-08-16 11:56:46.434075+00
62	LED bulbs	building-materials-hardware-electricals-led-bulbs	\N	19	PRODUCT	t	2026-08-16 11:56:46.434075+00
63	House paints	building-materials-hardware-electricals-house-paints	\N	19	PRODUCT	t	2026-08-16 11:56:46.434075+00
64	Plumbing fittings	building-materials-hardware-electricals-plumbing-fittings	\N	19	PRODUCT	t	2026-08-16 11:56:46.434075+00
65	Door locks	building-materials-hardware-electricals-door-locks	\N	19	PRODUCT	t	2026-08-16 11:56:46.434075+00
66	Extension cords	building-materials-hardware-electricals-extension-cords	\N	19	PRODUCT	t	2026-08-16 11:56:46.434075+00
67	Wholesale mobile accessories	electronics-appliances-mobile-wholesale-mobile-accessories	\N	22	PRODUCT	t	2026-08-16 11:56:46.434075+00
68	Office IT equipment	electronics-appliances-mobile-office-it-equipment	\N	22	PRODUCT	t	2026-08-16 11:56:46.434075+00
69	Bulk computer peripherals	electronics-appliances-mobile-bulk-computer-peripherals	\N	22	PRODUCT	t	2026-08-16 11:56:46.434075+00
70	Commercial cooling systems	electronics-appliances-mobile-commercial-cooling-systems	\N	22	PRODUCT	t	2026-08-16 11:56:46.434075+00
71	Smartphones	electronics-appliances-mobile-smartphones	\N	22	PRODUCT	t	2026-08-16 11:56:46.434075+00
72	Home audio	electronics-appliances-mobile-home-audio	\N	22	PRODUCT	t	2026-08-16 11:56:46.434075+00
73	Kitchen appliances	electronics-appliances-mobile-kitchen-appliances	\N	22	PRODUCT	t	2026-08-16 11:56:46.434075+00
74	Chargers	electronics-appliances-mobile-chargers	\N	22	PRODUCT	t	2026-08-16 11:56:46.434075+00
75	Cables	electronics-appliances-mobile-cables	\N	22	PRODUCT	t	2026-08-16 11:56:46.434075+00
76	Smart wearables	electronics-appliances-mobile-smart-wearables	\N	22	PRODUCT	t	2026-08-16 11:56:46.434075+00
77	Fabric bolts	apparel-textiles-packaging-fabric-bolts	\N	25	PRODUCT	t	2026-08-16 11:56:46.434075+00
78	Uniform manufacturing	apparel-textiles-packaging-uniform-manufacturing	\N	25	PRODUCT	t	2026-08-16 11:56:46.434075+00
79	Corrugated shipping boxes	apparel-textiles-packaging-corrugated-shipping-boxes	\N	25	PRODUCT	t	2026-08-16 11:56:46.434075+00
80	Packaging tape	apparel-textiles-packaging-packaging-tape	\N	25	PRODUCT	t	2026-08-16 11:56:46.434075+00
81	Bio-hazard bags	apparel-textiles-packaging-bio-hazard-bags	\N	25	PRODUCT	t	2026-08-16 11:56:46.434075+00
82	Casual wear	apparel-textiles-packaging-casual-wear	\N	25	PRODUCT	t	2026-08-16 11:56:46.434075+00
83	Ethnic clothing	apparel-textiles-packaging-ethnic-clothing	\N	25	PRODUCT	t	2026-08-16 11:56:46.434075+00
84	Footwear	apparel-textiles-packaging-footwear	\N	25	PRODUCT	t	2026-08-16 11:56:46.434075+00
85	Travel bags	apparel-textiles-packaging-travel-bags	\N	25	PRODUCT	t	2026-08-16 11:56:46.434075+00
86	Fashion accessories	apparel-textiles-packaging-fashion-accessories	\N	25	PRODUCT	t	2026-08-16 11:56:46.434075+00
87	Wholesale PPE kits	medical-hygiene-safety-wholesale-ppe-kits	\N	28	PRODUCT	t	2026-08-16 11:56:46.434075+00
88	Surgical gloves	medical-hygiene-safety-surgical-gloves	\N	28	PRODUCT	t	2026-08-16 11:56:46.434075+00
89	Sanitizer drums	medical-hygiene-safety-sanitizer-drums	\N	28	PRODUCT	t	2026-08-16 11:56:46.434075+00
90	Industrial safety gear	medical-hygiene-safety-industrial-safety-gear	\N	28	PRODUCT	t	2026-08-16 11:56:46.434075+00
91	Medical consumables for clinics	medical-hygiene-safety-medical-consumables-for-clinics	\N	28	PRODUCT	t	2026-08-16 11:56:46.434075+00
92	First-aid kits	medical-hygiene-safety-first-aid-kits	\N	28	PRODUCT	t	2026-08-16 11:56:46.434075+00
93	Over-the-counter wellness products	medical-hygiene-safety-over-the-counter-wellness-products	\N	28	PRODUCT	t	2026-08-16 11:56:46.434075+00
94	Personal hygiene items	medical-hygiene-safety-personal-hygiene-items	\N	28	PRODUCT	t	2026-08-16 11:56:46.434075+00
95	Home sanitization	medical-hygiene-safety-home-sanitization	\N	28	PRODUCT	t	2026-08-16 11:56:46.434075+00
96	Commercial HVAC maintenance	home-office-maintenance-commercial-hvac-maintenance	\N	31	SERVICE	t	2026-08-16 11:56:46.434075+00
97	Office deep cleaning	home-office-maintenance-office-deep-cleaning	\N	31	SERVICE	t	2026-08-16 11:56:46.434075+00
98	Industrial pest control	home-office-maintenance-industrial-pest-control	\N	31	SERVICE	t	2026-08-16 11:56:46.434075+00
99	Fire safety audits	home-office-maintenance-fire-safety-audits	\N	31	SERVICE	t	2026-08-16 11:56:46.434075+00
100	AC repair	home-office-maintenance-ac-repair	\N	31	SERVICE	t	2026-08-16 11:56:46.434075+00
101	Home plumbing	home-office-maintenance-home-plumbing	\N	31	SERVICE	t	2026-08-16 11:56:46.434075+00
102	Electrician visits	home-office-maintenance-electrician-visits	\N	31	SERVICE	t	2026-08-16 11:56:46.434075+00
103	Sofa/carpet cleaning	home-office-maintenance-sofa-carpet-cleaning	\N	31	SERVICE	t	2026-08-16 11:56:46.434075+00
104	Handyman tasks	home-office-maintenance-handyman-tasks	\N	31	SERVICE	t	2026-08-16 11:56:46.434075+00
105	Intra-city mini-truck rentals (Tata Ace/Pickup)	logistics-delivery-fleet-intra-city-mini-truck-rentals-tata-ace-pickup	\N	34	SERVICE	t	2026-08-16 11:56:46.434075+00
106	Scheduled warehouse transfers	logistics-delivery-fleet-scheduled-warehouse-transfers	\N	34	SERVICE	t	2026-08-16 11:56:46.434075+00
107	Bulk freight dispatch	logistics-delivery-fleet-bulk-freight-dispatch	\N	34	SERVICE	t	2026-08-16 11:56:46.434075+00
108	Instant 2-wheeler parcel delivery	logistics-delivery-fleet-instant-2-wheeler-parcel-delivery	\N	34	SERVICE	t	2026-08-16 11:56:46.434075+00
109	Household shifting	logistics-delivery-fleet-household-shifting	\N	34	SERVICE	t	2026-08-16 11:56:46.434075+00
110	Furniture transport	logistics-delivery-fleet-furniture-transport	\N	34	SERVICE	t	2026-08-16 11:56:46.434075+00
111	GST filing & accounting	professional-business-services-gst-filing-and-accounting	\N	37	SERVICE	t	2026-08-16 11:56:46.434075+00
112	Legal drafting	professional-business-services-legal-drafting	\N	37	SERVICE	t	2026-08-16 11:56:46.434075+00
113	Local signage manufacturing	professional-business-services-local-signage-manufacturing	\N	37	SERVICE	t	2026-08-16 11:56:46.434075+00
114	Digital marketing	professional-business-services-digital-marketing	\N	37	SERVICE	t	2026-08-16 11:56:46.434075+00
115	IT setup	professional-business-services-it-setup	\N	37	SERVICE	t	2026-08-16 11:56:46.434075+00
116	Personal tax filing	professional-business-services-personal-tax-filing	\N	37	SERVICE	t	2026-08-16 11:56:46.434075+00
117	Notary assistance	professional-business-services-notary-assistance	\N	37	SERVICE	t	2026-08-16 11:56:46.434075+00
118	Passport photo services	professional-business-services-passport-photo-services	\N	37	SERVICE	t	2026-08-16 11:56:46.434075+00
119	Home computer repair	professional-business-services-home-computer-repair	\N	37	SERVICE	t	2026-08-16 11:56:46.434075+00
120	Corporate catering	event-management-catering-media-corporate-catering	\N	40	BOTH	t	2026-08-16 11:56:46.434075+00
121	Sound system rentals	event-management-catering-media-sound-system-rentals	\N	40	BOTH	t	2026-08-16 11:56:46.434075+00
122	Trade booth setup	event-management-catering-media-trade-booth-setup	\N	40	BOTH	t	2026-08-16 11:56:46.434075+00
123	Commercial event photography	event-management-catering-media-commercial-event-photography	\N	40	BOTH	t	2026-08-16 11:56:46.434075+00
124	Party catering	event-management-catering-media-party-catering	\N	40	BOTH	t	2026-08-16 11:56:46.434075+00
125	Wedding photography	event-management-catering-media-wedding-photography	\N	40	BOTH	t	2026-08-16 11:56:46.434075+00
126	Home party decoration	event-management-catering-media-home-party-decoration	\N	40	BOTH	t	2026-08-16 11:56:46.434075+00
127	DJ booking	event-management-catering-media-dj-booking	\N	40	BOTH	t	2026-08-16 11:56:46.434075+00
128	Wholesale salon supplies	personal-care-beauty-wellness-wholesale-salon-supplies	\N	43	PRODUCT	t	2026-08-16 11:56:46.434075+00
129	Equipment leasing for spas	personal-care-beauty-wellness-equipment-leasing-for-spas	\N	43	PRODUCT	t	2026-08-16 11:56:46.434075+00
130	Staff training modules	personal-care-beauty-wellness-staff-training-modules	\N	43	PRODUCT	t	2026-08-16 11:56:46.434075+00
131	At-home salon services	personal-care-beauty-wellness-at-home-salon-services	\N	43	SERVICE	t	2026-08-16 11:56:46.434075+00
132	Barber visits	personal-care-beauty-wellness-barber-visits	\N	43	SERVICE	t	2026-08-16 11:56:46.434075+00
133	Personal fitness trainers	personal-care-beauty-wellness-personal-fitness-trainers	\N	43	SERVICE	t	2026-08-16 11:56:46.434075+00
134	Physiotherapy at home	personal-care-beauty-wellness-physiotherapy-at-home	\N	43	SERVICE	t	2026-08-16 11:56:46.434075+00
\.


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chat_messages (id, order_id, sender_id, body, created_at) FROM stdin;
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conversations (id, consumer_id, provider_id, category_id, created_at, updated_at, consumer_last_read_at, provider_last_read_at) FROM stdin;
95e39aa0-1685-4423-ae31-77a5b18932cf	1722a4da-eccb-4ec0-bed8-8584a1af927f	7f2f84db-12a2-4c8a-a220-3eff3183da55	16	2026-08-17 09:18:28.480065+00	2026-08-17 09:18:31.627288+00	2026-08-17 09:18:31.632324+00	2026-08-17 09:18:31.627288+00
be83b8fa-6a6a-48e5-bf10-f4a860f5ba86	1722a4da-eccb-4ec0-bed8-8584a1af927f	dc082189-6ab5-4dc0-9a72-8e539e75b6ea	16	2026-08-13 10:09:18.185142+00	2026-08-17 15:02:14.448313+00	2026-08-17 15:02:14.459416+00	2026-08-13 10:22:44.093118+00
94ffdb8e-4651-4368-855a-125173ceee15	1722a4da-eccb-4ec0-bed8-8584a1af927f	7870aff3-900b-4388-9525-1a2105eed073	1	2026-08-11 06:17:06.844251+00	2026-08-17 15:05:18.34679+00	2026-08-15 12:13:04.147958+00	2026-08-17 15:05:18.362644+00
804badd9-9f88-4aea-a4d6-6eb7109a054a	1722a4da-eccb-4ec0-bed8-8584a1af927f	ba5f1bb2-b208-4b24-9a52-570f8f68e394	22	2026-08-16 08:59:10.212975+00	2026-08-16 12:05:01.596992+00	2026-08-16 08:59:16.389065+00	2026-08-16 08:59:16.382486+00
\.


--
-- Data for Name: inquiry_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inquiry_messages (id, conversation_id, sender_id, body, created_at) FROM stdin;
a093064f-2214-4f8e-a7fd-f1b809e432c2	94ffdb8e-4651-4368-855a-125173ceee15	1722a4da-eccb-4ec0-bed8-8584a1af927f	Hi QuickFix Plumbing, I have a quick question about Plumbing.	2026-08-11 06:17:06.844251+00
69557c9a-0aed-4c53-8675-6f313e24d1dc	94ffdb8e-4651-4368-855a-125173ceee15	1722a4da-eccb-4ec0-bed8-8584a1af927f	hi	2026-08-11 06:17:12.491507+00
c69e13ea-1080-45a0-bfd4-d427086ca31b	94ffdb8e-4651-4368-855a-125173ceee15	1722a4da-eccb-4ec0-bed8-8584a1af927f	hi	2026-08-12 10:18:10.690709+00
3b6d9f2c-a5e9-4c22-a424-f9c7aedbddc1	94ffdb8e-4651-4368-855a-125173ceee15	1722a4da-eccb-4ec0-bed8-8584a1af927f	jhj	2026-08-12 10:18:19.410142+00
62c00676-8a0e-4091-ba89-cafda03d9b15	94ffdb8e-4651-4368-855a-125173ceee15	7870aff3-900b-4388-9525-1a2105eed073	ji	2026-08-13 05:31:16.145807+00
8f95eb22-e038-432f-a14e-60b57a07a459	94ffdb8e-4651-4368-855a-125173ceee15	7870aff3-900b-4388-9525-1a2105eed073	Hi, I received your request "leak in kitchen". Could I ask a few clarifying questions?	2026-08-13 05:31:47.241704+00
288ca1a7-591b-4e8a-9346-d92efb121be9	94ffdb8e-4651-4368-855a-125173ceee15	7870aff3-900b-4388-9525-1a2105eed073	Hi, I received your request "leak in kitchen". Could I ask a few clarifying questions?	2026-08-13 09:03:10.496049+00
6eec2b4e-27fc-4b8f-a790-3009fd3ee6b3	94ffdb8e-4651-4368-855a-125173ceee15	7870aff3-900b-4388-9525-1a2105eed073	Hi, following up on my quote for "leak in kitchen".	2026-08-13 09:24:31.704887+00
e78b7e77-d981-41a8-9380-baf184c326ee	94ffdb8e-4651-4368-855a-125173ceee15	7870aff3-900b-4388-9525-1a2105eed073	Hi, following up on my quote for "leak in kitchen".	2026-08-13 09:29:33.325772+00
4fa1c493-ec70-4229-9552-0ac300ba7c36	94ffdb8e-4651-4368-855a-125173ceee15	1722a4da-eccb-4ec0-bed8-8584a1af927f	Hi, following up on my request "leak in kitchen".	2026-08-13 09:35:00.010506+00
b09a1a9d-a6c3-42e4-b083-549b253e1e11	94ffdb8e-4651-4368-855a-125173ceee15	7870aff3-900b-4388-9525-1a2105eed073	Hi, following up on my quote for "leak in kitchen".	2026-08-13 09:35:05.723681+00
35b31fc7-8ea3-4907-a5c9-e3916f11e78f	94ffdb8e-4651-4368-855a-125173ceee15	1722a4da-eccb-4ec0-bed8-8584a1af927f	sbdhad	2026-08-13 09:35:24.940437+00
7ac9054a-7732-4811-bbc6-ae241da84d7c	94ffdb8e-4651-4368-855a-125173ceee15	7870aff3-900b-4388-9525-1a2105eed073	Hi, following up on my quote for "leak in kitchen".	2026-08-13 09:35:27.828462+00
b69bdc19-de9f-4669-849d-b71a77a8ffb2	94ffdb8e-4651-4368-855a-125173ceee15	7870aff3-900b-4388-9525-1a2105eed073	Hi, following up on my quote for "leak in kitchen".	2026-08-13 09:35:33.931571+00
9f5e9906-813c-49d1-9c01-2971368adb34	be83b8fa-6a6a-48e5-bf10-f4a860f5ba86	1722a4da-eccb-4ec0-bed8-8584a1af927f	Hi, following up on my request "capsi".	2026-08-13 10:09:18.185142+00
4690f63c-b8db-4f80-a9cc-872fbc2df36f	be83b8fa-6a6a-48e5-bf10-f4a860f5ba86	1722a4da-eccb-4ec0-bed8-8584a1af927f	hi when can you deliver	2026-08-13 10:09:25.816077+00
2a93fc5c-a047-4d26-ba7f-e8aed66d4830	be83b8fa-6a6a-48e5-bf10-f4a860f5ba86	dc082189-6ab5-4dc0-9a72-8e539e75b6ea	wnbsf	2026-08-13 10:09:37.709676+00
5e79961f-841d-43a0-9e1d-523f08dabe4d	94ffdb8e-4651-4368-855a-125173ceee15	1722a4da-eccb-4ec0-bed8-8584a1af927f	hgjhghj	2026-08-15 11:07:03.493829+00
4d958a85-d699-4677-97c2-3dceffe71639	be83b8fa-6a6a-48e5-bf10-f4a860f5ba86	1722a4da-eccb-4ec0-bed8-8584a1af927f	hjghhj	2026-08-15 11:25:44.318319+00
6cf8e45a-c7c0-41c4-ba02-027c59c4ff03	be83b8fa-6a6a-48e5-bf10-f4a860f5ba86	1722a4da-eccb-4ec0-bed8-8584a1af927f	hi	2026-08-15 11:42:54.087614+00
5c991c4c-4b2c-4546-8e2c-9e7e821e9911	be83b8fa-6a6a-48e5-bf10-f4a860f5ba86	1722a4da-eccb-4ec0-bed8-8584a1af927f	fjjjfjf	2026-08-15 11:45:11.299801+00
6444f638-9bb2-498e-9d04-24b434b3ab84	be83b8fa-6a6a-48e5-bf10-f4a860f5ba86	1722a4da-eccb-4ec0-bed8-8584a1af927f	hgjhfgfgffgj	2026-08-15 12:04:39.975177+00
41bf47cf-dd47-4916-bc5b-5f1127416884	804badd9-9f88-4aea-a4d6-6eb7109a054a	1722a4da-eccb-4ec0-bed8-8584a1af927f	Hi, I'm interested in your services.	2026-08-16 08:59:10.212975+00
143246a3-f707-4894-8ac4-0914f5971bf1	95e39aa0-1685-4423-ae31-77a5b18932cf	1722a4da-eccb-4ec0-bed8-8584a1af927f	Hi, I'm interested in your services.	2026-08-17 09:18:28.480065+00
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.orders (id, quote_id, request_id, consumer_id, provider_id, agreed_price, fulfillment_type, payment_mode, status, completion_otp, completed_at, created_at, updated_at) FROM stdin;
802ae8d7-fb46-4135-b1d5-a64eed25d747	679bb077-428b-46fe-9600-8503324ed16d	7f7644f5-af0f-4ab0-8a4a-f3bebda98eb1	1722a4da-eccb-4ec0-bed8-8584a1af927f	7870aff3-900b-4388-9525-1a2105eed073	400.00	PROVIDER_DELIVERY	CASH	COMPLETED	909858	2026-08-13 09:48:06.681674+00	2026-08-13 09:37:38.537224+00	2026-08-13 09:48:06.6736+00
b4cf877d-597d-4e95-8ad1-ffbdfe22222c	59c20bbd-804a-43ad-992e-a2b8a4751b27	54b0fb1d-463b-4015-841d-b5917490fc37	1722a4da-eccb-4ec0-bed8-8584a1af927f	dc082189-6ab5-4dc0-9a72-8e539e75b6ea	467.00	PROVIDER_DELIVERY	CASH	COMPLETED	140853	2026-08-13 10:28:14.218456+00	2026-08-13 10:27:21.031978+00	2026-08-13 10:28:14.210006+00
032f3148-628b-43eb-a081-c2a29d8da155	e8a329b5-0135-4273-a32f-9b8dd2f00eff	9cf476eb-6036-4bc7-aca5-c2bfe62dbf59	1722a4da-eccb-4ec0-bed8-8584a1af927f	dc082189-6ab5-4dc0-9a72-8e539e75b6ea	400.00	PROVIDER_DELIVERY	CASH	IN_PROGRESS	533832	\N	2026-08-15 11:03:43.542443+00	2026-08-15 11:03:43.542443+00
\.


--
-- Data for Name: provider_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.provider_categories (id, provider_id, category_id) FROM stdin;
1	33cc0aef-31b7-4ec2-9446-bf42d36c6af4	1
2	33cc0aef-31b7-4ec2-9446-bf42d36c6af4	2
3	33cc0aef-31b7-4ec2-9446-bf42d36c6af4	3
355	de2c7876-6224-455e-9574-8a3223d05e67	1
356	de2c7876-6224-455e-9574-8a3223d05e67	2
357	de2c7876-6224-455e-9574-8a3223d05e67	3
364	d3e0feaf-16e7-4ba2-9816-4fa5a2d64635	10
365	d3e0feaf-16e7-4ba2-9816-4fa5a2d64635	11
366	ebf49e2c-3303-48dc-bb65-2ee39100974a	12
367	ebf49e2c-3303-48dc-bb65-2ee39100974a	13
368	c13b4848-bfa8-422a-bce7-1d73a71f6d8e	14
369	c13b4848-bfa8-422a-bce7-1d73a71f6d8e	15
370	abab80fc-5031-4261-bdcf-bb086fc5b113	1
371	abab80fc-5031-4261-bdcf-bb086fc5b113	2
372	abab80fc-5031-4261-bdcf-bb086fc5b113	3
379	f387aca5-5a72-484f-83d3-415262d99939	10
380	f387aca5-5a72-484f-83d3-415262d99939	11
381	2ed85bad-48fa-4801-a3d0-8db799862472	12
382	2ed85bad-48fa-4801-a3d0-8db799862472	13
383	39b933a1-2ca3-4ce0-8d4c-47e34d384bd5	14
384	39b933a1-2ca3-4ce0-8d4c-47e34d384bd5	15
385	5360992d-15f1-4102-988c-98c5f592acc7	1
386	5360992d-15f1-4102-988c-98c5f592acc7	2
387	5360992d-15f1-4102-988c-98c5f592acc7	3
394	f330fdc7-77b6-445b-bd48-6f62886dd480	10
395	f330fdc7-77b6-445b-bd48-6f62886dd480	11
396	f5a50b12-eb7b-4300-8f59-f388352eea7b	12
397	f5a50b12-eb7b-4300-8f59-f388352eea7b	13
398	bf3c62fa-32c1-4b2c-8e43-1173ce0fdef9	14
399	bf3c62fa-32c1-4b2c-8e43-1173ce0fdef9	15
1020	5f29e098-984e-4db9-b51f-a3f3e402d4ef	16
1021	600368f7-e39d-4da9-9bb3-015faf1df671	16
1022	caa7735f-6e8c-42e3-8d24-b3b34491694a	16
1023	07f6f309-6517-47c2-bce6-48168de83b76	16
1024	cd204ef2-795a-4d7a-8468-7bd43226ab7e	22
1025	22873fb5-6f58-4592-acb3-3301cef5ef87	22
1026	dc22dedf-6da9-4eef-88f7-8feb2de58cfb	22
\.


--
-- Data for Name: provider_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.provider_profiles (id, user_id, business_name, category_id, description, offer_kind, offerings_detail, website_url, instagram_url, youtube_url, opening_time, closing_time, gst_number, aadhaar_number, base_location, max_radius_km, is_online, verification_status, government_id_url, business_reg_url, aadhaar_doc_url, gst_doc_url, tax_id, created_at, updated_at, public_slug, ekyc_photo_url, ekyc_latitude, ekyc_longitude, ekyc_location_label, ekyc_status, ekyc_captured_at, ekyc_video_requested_at) FROM stdin;
d3e0feaf-16e7-4ba2-9816-4fa5a2d64635	9eff45fc-c92e-4012-856a-be9723e70ff1	Bhubaneswar SparkSafe Electricals	10	Trusted electrical in Bhubaneswar	SERVICE	Home wiring, switchboards, inverter setup, and fan / light fitting.	\N	\N	\N	08:00	19:00	21AAAAA0104A1Z5	\N	0101000020E6100000DF4F8D976E7655400F9C33A2B4473440	15	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00	bbsr-electrical	\N	\N	\N	\N	NONE	\N	\N
ebf49e2c-3303-48dc-bb65-2ee39100974a	657a9a29-bb4c-48a7-94ac-900dde1711bd	Bhubaneswar Spotless Home Care	12	Trusted cleaning in Bhubaneswar	SERVICE	Full-home deep cleaning, kitchen / bathroom sanitising, and sofa shampoo.	\N	\N	\N	08:00	18:00	21AAAAA0105A1Z5	\N	0101000020E61000009CC420B072745540DB68006F81543440	12	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00	bbsr-cleaning	\N	\N	\N	\N	NONE	\N	\N
c13b4848-bfa8-422a-bce7-1d73a71f6d8e	e1d9c33b-4dbe-453a-b3a5-0bccee2a8a2a	Bhubaneswar TimberCraft	14	Trusted carpentry in Bhubaneswar	BOTH	Custom furniture, door / window repair, and modular kitchen carpentry.	\N	\N	\N	22:00	23:00	21AAAAA0106A1Z5	\N	0101000020E61000006F1283C0CA7555404CA60A4625453440	10	f	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00	bbsr-carpentry	\N	\N	\N	\N	NONE	\N	\N
abab80fc-5031-4261-bdcf-bb086fc5b113	b562ee08-6cdb-4914-87a9-4c99ef122130	Sambalpur Plumbing Works	1	Trusted plumbing in Sambalpur	SERVICE	Emergency leak fixes, tap replacement, bathroom fitting, and pipe unblocking.	\N	\N	\N	08:00	20:00	21AAAAA0201A1Z5	\N	0101000020E610000074B515FBCBFE54409D8026C286773540	12	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00	sbp-plumbing	\N	\N	\N	\N	NONE	\N	\N
5f29e098-984e-4db9-b51f-a3f3e402d4ef	dc082189-6ab5-4dc0-9a72-8e539e75b6ea	Wedding Card	16	Best wedding card services	BOTH	Best wedding card services	\N	\N	\N	\N	\N	VGVSJDHD344555	\N	0101000020E610000094331477BC745540D8D64FFF595B3440	5	t	APPROVED	\N	\N	/media/f1388245b3d7464082fa4b9d7e82d730.pdf	\N	\N	2026-08-05 06:05:20.579413+00	2026-08-16 12:05:01.596992+00	wedding-card	\N	\N	\N	\N	\N	\N	\N
de2c7876-6224-455e-9574-8a3223d05e67	8ecd7166-9d1b-459a-a3bc-ef66195730e5	Bhubaneswar Plumbing Works	1	Trusted plumbing in Bhubaneswar	SERVICE	Emergency leak fixes, tap replacement, bathroom fitting, and pipe unblocking.	\N	\N	\N	08:00	20:00	21AAAAA0101A1Z5	\N	0101000020E610000054E3A59BC47455407958A835CD4B3440	12	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00	bbsr-plumbing	\N	\N	\N	\N	NONE	\N	\N
600368f7-e39d-4da9-9bb3-015faf1df671	7f2f84db-12a2-4c8a-a220-3eff3183da55	Bhubaneswar Fresh Basket Kirana	16	Trusted groceries in Bhubaneswar	PRODUCT	Daily staples, fresh produce, oil, spices, and household essentials.	\N	\N	\N	07:00	21:00	21AAAAA0102A1Z5	\N	0101000020E610000062105839B4745540B437F8C2645A3440	8	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 12:05:01.596992+00	bbsr-groceries	\N	\N	\N	\N	NONE	\N	\N
caa7735f-6e8c-42e3-8d24-b3b34491694a	343818a3-43e0-4698-ac76-f74c4575e93b	Sambalpur Fresh Basket Kirana	16	Trusted groceries in Sambalpur	PRODUCT	Daily staples, fresh produce, oil, spices, and household essentials.	\N	\N	\N	07:00	21:00	21AAAAA0202A1Z5	\N	0101000020E6100000CAC342AD69FE5440ED0DBE30997A3540	8	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 12:05:01.596992+00	sbp-groceries	\N	\N	\N	\N	NONE	\N	\N
cd204ef2-795a-4d7a-8468-7bd43226ab7e	ba5f1bb2-b208-4b24-9a52-570f8f68e394	Bhubaneswar Gadget Hub	22	Trusted electronics in Bhubaneswar	BOTH	Mobiles, accessories, and same-day phone / laptop repair.	\N	\N	\N	10:00	21:00	21AAAAA0103A1Z5	\N	0101000020E6100000AAF1D24D627455409487855AD34C3440	10	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 12:05:01.596992+00	bbsr-electronics	\N	\N	\N	\N	NONE	\N	\N
22873fb5-6f58-4592-acb3-3301cef5ef87	a23d3c79-4d1e-41ec-9969-633ff0424fe7	Sambalpur Gadget Hub	22	Trusted electronics in Sambalpur	BOTH	Mobiles, accessories, and same-day phone / laptop repair.	\N	\N	\N	10:00	21:00	21AAAAA0203A1Z5	\N	0101000020E6100000F31FD26F5FFF54402E6EA301BC753540	10	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 12:05:01.596992+00	sbp-electronics	\N	\N	\N	\N	NONE	\N	\N
33cc0aef-31b7-4ec2-9446-bf42d36c6af4	7870aff3-900b-4388-9525-1a2105eed073	QuickFix Plumbing	1	Trusted neighbourhood plumber	SERVICE	Emergency leak fixes, tap replacement, bathroom fitting, and pipe unblocking.	\N	\N	\N	08:00	20:00	29AAAAA0000A1Z5	\N	0101000020E6100000548DD064C17455405CDAA6CB9D5B3440	10	f	APPROVED	\N	\N	\N	/media/d9ce6c9cc5664997a23ca1dcafef8e38.jpg	\N	2026-08-05 05:53:14.539314+00	2026-08-17 15:03:50.087241+00	quickfix-plumbing	\N	\N	\N	\N	\N	\N	\N
f387aca5-5a72-484f-83d3-415262d99939	242496fd-f68e-4d23-9ec2-93cf1fade99c	Sambalpur SparkSafe Electricals	10	Trusted electrical in Sambalpur	SERVICE	Home wiring, switchboards, inverter setup, and fan / light fitting.	\N	\N	\N	08:00	19:00	21AAAAA0204A1Z5	\N	0101000020E610000012A5BDC117FE5440B459F5B9DA7A3540	15	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00	sbp-electrical	\N	\N	\N	\N	NONE	\N	\N
2ed85bad-48fa-4801-a3d0-8db799862472	63acc00e-b900-4233-bdd3-680174d37904	Sambalpur Spotless Home Care	12	Trusted cleaning in Sambalpur	SERVICE	Full-home deep cleaning, kitchen / bathroom sanitising, and sofa shampoo.	\N	\N	\N	08:00	18:00	21AAAAA0205A1Z5	\N	0101000020E6100000014D840D4FFF5440DA8AFD65F7743540	12	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00	sbp-cleaning	\N	\N	\N	\N	NONE	\N	\N
39b933a1-2ca3-4ce0-8d4c-47e34d384bd5	b3a5b701-c96e-4f6b-ac3e-7b69d140ae46	Sambalpur TimberCraft	14	Trusted carpentry in Sambalpur	BOTH	Custom furniture, door / window repair, and modular kitchen carpentry.	\N	\N	\N	22:00	23:00	21AAAAA0206A1Z5	\N	0101000020E6100000C898BB9690FF5440454772F90F793540	10	f	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00	sbp-carpentry	\N	\N	\N	\N	NONE	\N	\N
5360992d-15f1-4102-988c-98c5f592acc7	4181c42d-6015-4fa0-8e17-36579201041d	Jharsuguda Plumbing Works	1	Trusted plumbing in Jharsuguda	SERVICE	Emergency leak fixes, tap replacement, bathroom fitting, and pipe unblocking.	\N	\N	\N	08:00	20:00	21AAAAA0301A1Z5	\N	0101000020E61000000E4FAF946500554097FF907EFBDA3540	12	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00	jsg-plumbing	\N	\N	\N	\N	NONE	\N	\N
f330fdc7-77b6-445b-bd48-6f62886dd480	f10dc566-dc0c-4482-8b18-8e8f81bc5534	Jharsuguda SparkSafe Electricals	10	Trusted electrical in Jharsuguda	SERVICE	Home wiring, switchboards, inverter setup, and fan / light fitting.	\N	\N	\N	08:00	19:00	21AAAAA0304A1Z5	\N	0101000020E6100000B84082E2C70055405AF5B9DA8ADD3540	15	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00	jsg-electrical	\N	\N	\N	\N	NONE	\N	\N
f5a50b12-eb7b-4300-8f59-f388352eea7b	d3ba8e13-fd0b-4635-bf83-4d427d208a1b	Jharsuguda Spotless Home Care	12	Trusted cleaning in Jharsuguda	SERVICE	Full-home deep cleaning, kitchen / bathroom sanitising, and sofa shampoo.	\N	\N	\N	08:00	18:00	21AAAAA0305A1Z5	\N	0101000020E61000004703780B2400554062A1D634EFD83540	12	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00	jsg-cleaning	\N	\N	\N	\N	NONE	\N	\N
bf3c62fa-32c1-4b2c-8e43-1173ce0fdef9	04f06e57-0208-4588-9203-a4f4bbeafce3	Jharsuguda TimberCraft	14	Trusted carpentry in Jharsuguda	BOTH	Custom furniture, door / window repair, and modular kitchen carpentry.	\N	\N	\N	22:00	23:00	21AAAAA0306A1Z5	\N	0101000020E6100000AA13D044D8005540EBE2361AC0DB3540	10	f	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00	jsg-carpentry	\N	\N	\N	\N	NONE	\N	\N
07f6f309-6517-47c2-bce6-48168de83b76	a4743d86-2fc0-4d0a-b26f-e521a9c12ed8	Jharsuguda Fresh Basket Kirana	16	Trusted groceries in Jharsuguda	PRODUCT	Daily staples, fresh produce, oil, spices, and household essentials.	\N	\N	\N	07:00	21:00	21AAAAA0302A1Z5	\N	0101000020E61000008DB96B09F9005540B6847CD0B3D93540	8	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 12:05:01.596992+00	jsg-groceries	\N	\N	\N	\N	NONE	\N	\N
dc22dedf-6da9-4eef-88f7-8feb2de58cfb	6bbae45c-d2d7-4a56-9c00-356c6717fa76	Jharsuguda Gadget Hub	22	Trusted electronics in Jharsuguda	BOTH	Mobiles, accessories, and same-day phone / laptop repair.	\N	\N	\N	10:00	21:00	21AAAAA0303A1Z5	\N	0101000020E6100000AC3E575BB1FF5440787AA52C43DC3540	10	t	APPROVED	\N	\N	\N	\N	\N	2026-08-16 06:12:19.749505+00	2026-08-16 12:05:01.596992+00	jsg-electronics	\N	\N	\N	\N	NONE	\N	\N
\.


--
-- Data for Name: quotes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quotes (id, request_id, provider_id, price_quote, currency, estimated_days, message, catalog_url, status, created_at, updated_at, consumer_seen_at) FROM stdin;
2283b39c-4c90-436c-94c4-594a4a436150	f938e140-e637-4566-8624-c69447c441ad	dc082189-6ab5-4dc0-9a72-8e539e75b6ea	1000.00	INR	1	Re: carrot	\N	PENDING	2026-08-10 10:33:19.342295+00	2026-08-10 10:33:19.342295+00	2026-08-10 10:33:19.342295+00
679bb077-428b-46fe-9600-8503324ed16d	7f7644f5-af0f-4ab0-8a4a-f3bebda98eb1	7870aff3-900b-4388-9525-1a2105eed073	400.00	INR	2	Re: leak in kitchen	\N	ACCEPTED	2026-08-13 09:06:15.722817+00	2026-08-13 09:37:38.537224+00	2026-08-13 09:06:15.722817+00
59c20bbd-804a-43ad-992e-a2b8a4751b27	54b0fb1d-463b-4015-841d-b5917490fc37	dc082189-6ab5-4dc0-9a72-8e539e75b6ea	467.00	INR	1	Re: Veggies\n\nAvailable	\N	ACCEPTED	2026-08-10 10:32:48.180461+00	2026-08-13 10:27:21.031978+00	2026-08-10 10:32:48.180461+00
e8a329b5-0135-4273-a32f-9b8dd2f00eff	9cf476eb-6036-4bc7-aca5-c2bfe62dbf59	dc082189-6ab5-4dc0-9a72-8e539e75b6ea	400.00	INR	1	Re: capsi	\N	ACCEPTED	2026-08-13 10:05:53.297883+00	2026-08-15 11:03:43.542443+00	2026-08-13 10:05:53.297883+00
4379f77c-8006-4106-ab9a-f9dd7627f194	82de1f70-7506-40ce-8359-8972238e7e5b	7870aff3-900b-4388-9525-1a2105eed073	200.00	INR	1	Re: leak in kitchen	\N	PENDING	2026-08-16 10:13:22.4405+00	2026-08-16 10:13:22.4405+00	2026-08-16 10:13:22.4405+00
\.


--
-- Data for Name: ratings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ratings (id, order_id, rater_id, ratee_id, score, comment, created_at) FROM stdin;
\.


--
-- Data for Name: request_targets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.request_targets (id, request_id, provider_id) FROM stdin;
1	7f7644f5-af0f-4ab0-8a4a-f3bebda98eb1	7870aff3-900b-4388-9525-1a2105eed073
2	9cf476eb-6036-4bc7-aca5-c2bfe62dbf59	dc082189-6ab5-4dc0-9a72-8e539e75b6ea
3	82de1f70-7506-40ce-8359-8972238e7e5b	7870aff3-900b-4388-9525-1a2105eed073
\.


--
-- Data for Name: service_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.service_requests (id, consumer_id, category_id, title, description, request_location, request_pincode, search_radius_km, target_mode, status, expires_at, created_at, updated_at) FROM stdin;
8399bb06-6797-41f2-9ea1-082e2ada0c20	1722a4da-eccb-4ec0-bed8-8584a1af927f	14	Dining table making	dajfkgskdgfjksdf	0101000020E610000094331477BC745540D8D64FFF595B3440	751024	5	BROADCAST	CANCELLED	2026-08-05 13:26:21.155533+00	2026-08-05 11:26:21.154583+00	2026-08-11 05:42:43.380667+00
7f7644f5-af0f-4ab0-8a4a-f3bebda98eb1	1722a4da-eccb-4ec0-bed8-8584a1af927f	1	leak in kitchen	gfjgf	0101000020E610000094331477BC745540D8D64FFF595B3440	751024	5	TARGETED	FULFILLED	2026-08-11 10:38:04.712804+00	2026-08-11 08:38:04.704437+00	2026-08-13 09:37:38.537224+00
82de1f70-7506-40ce-8359-8972238e7e5b	1722a4da-eccb-4ec0-bed8-8584a1af927f	1	leak in kitchen	need help	0101000020E610000094331477BC745540D8D64FFF595B3440	751024	5	TARGETED	ACTIVE	2026-08-16 11:57:31.515386+00	2026-08-16 09:57:31.507618+00	2026-08-16 09:57:31.507618+00
f938e140-e637-4566-8624-c69447c441ad	1722a4da-eccb-4ec0-bed8-8584a1af927f	16	carrot	esgdfbdg	0101000020E610000094331477BC745540D8D64FFF595B3440	751024	5	BROADCAST	ACTIVE	2026-08-08 14:25:29.748666+00	2026-08-08 12:25:29.74585+00	2026-08-16 12:05:01.596992+00
54b0fb1d-463b-4015-841d-b5917490fc37	1722a4da-eccb-4ec0-bed8-8584a1af927f	16	Veggies	dhfkjsdhgjkshgs	0101000020E610000094331477BC745540D8D64FFF595B3440	751024	5	BROADCAST	FULFILLED	2026-08-08 14:22:48.268637+00	2026-08-08 12:22:48.266937+00	2026-08-16 12:05:01.596992+00
9cf476eb-6036-4bc7-aca5-c2bfe62dbf59	1722a4da-eccb-4ec0-bed8-8584a1af927f	16	capsi	5kg capsi	0101000020E610000094331477BC745540D8D64FFF595B3440	751024	5	TARGETED	FULFILLED	2026-08-12 08:17:26.87777+00	2026-08-12 06:17:26.868767+00	2026-08-16 12:05:01.596992+00
deb962fc-bc93-46a5-b333-95886515c278	1722a4da-eccb-4ec0-bed8-8584a1af927f	16	cabbage	5 kg i need	0101000020E610000062105839B4745540B537F8C2645A3440	751024	5	BROADCAST	ACTIVE	2026-08-17 08:59:26.727851+00	2026-08-17 06:59:26.722939+00	2026-08-17 06:59:26.722939+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, role, phone_number, email, full_name, hashed_password, is_active, is_verified, average_rating, rating_count, location_label, latitude, longitude, address_line1, address_line2, city, state, pincode, alternate_phone, created_at, updated_at) FROM stdin;
015eb23c-4ba2-410c-bf44-f6d2434bbb32	ADMIN	9000000001	admin@localsync.app	LocalSync Admin	$2b$12$i2SUkxodvzl4o5zE/xRQ4ecudk4m8JHiL3DD2q2NYih.9nVtqajmK	t	t	0	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-08-05 05:53:14.539314+00	2026-08-05 05:53:14.539314+00
85d149bd-a327-4646-a34f-d9cb74b55aed	CONSUMER	9101000003	consumer.bbsr.3@gharq.app	Rohan Das	$2b$12$7ZE3BlydU1lIi8mQyODQKenPjUUMDYBtANCzxs2JvZ.YulvuFDKEy	t	t	0	0	Jaydev Vihar, Bhubaneswar	20.3001	85.8185	Jaydev Vihar, Bhubaneswar	\N	Bhubaneswar	Odisha	751001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
8ecd7166-9d1b-459a-a3bc-ef66195730e5	PROVIDER	9201000001	provider.bbsr.plumbing@gharq.app	Bhubaneswar Plumber	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.7	28	Saheed Nagar, Bhubaneswar	20.2961	85.8245	Saheed Nagar, Bhubaneswar	\N	Bhubaneswar	Odisha	751001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
7f2f84db-12a2-4c8a-a220-3eff3183da55	PROVIDER	9201000002	provider.bbsr.groceries@gharq.app	Bhubaneswar Kirana	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.5	41	Patia, Bhubaneswar	20.353099999999998	85.8235	Patia, Bhubaneswar	\N	Bhubaneswar	Odisha	751001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
1722a4da-eccb-4ec0-bed8-8584a1af927f	CONSUMER	9000000002	consumer@localsync.app	Demo Consumer	$2b$12$DKgs9da2Li6JvqB9eVvPFOFwH1NucoKtCpp1ILXQNUq4rR7G098O.	t	t	0	0	Bhubaneswar Municipal Corporation · 20.35684, 85.82400	20.356842	85.824003	\N	\N	Bhubaneswar Municipal Corporation	Odisha	751024	\N	2026-08-05 05:53:14.539314+00	2026-08-05 11:25:49.249872+00
ba5f1bb2-b208-4b24-9a52-570f8f68e394	PROVIDER	9201000003	provider.bbsr.electronics@gharq.app	Bhubaneswar Gadgets	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.4	19	Jaydev Vihar, Bhubaneswar	20.3001	85.8185	Jaydev Vihar, Bhubaneswar	\N	Bhubaneswar	Odisha	751001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
dc082189-6ab5-4dc0-9a72-8e539e75b6ea	PROVIDER	8897485425	alishapatel2006@gmail.com	Provider1	$2b$12$QgbYcnDLGeV98Xdn95aSauxlgSgQUMCfAfViPJAnnZg6qTKx1qsZO	t	t	0	0	Detected from device	20.356842	85.824003	\N	\N	\N	\N	\N	\N	2026-08-05 06:05:20.579413+00	2026-08-08 09:26:19.291773+00
9eff45fc-c92e-4012-856a-be9723e70ff1	PROVIDER	9201000004	provider.bbsr.electrical@gharq.app	Bhubaneswar Electrician	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.6	22	Rasulgarh, Bhubaneswar	20.2801	85.8505	Rasulgarh, Bhubaneswar	\N	Bhubaneswar	Odisha	751001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
657a9a29-bb4c-48a7-94ac-900dde1711bd	PROVIDER	9201000005	provider.bbsr.cleaning@gharq.app	Bhubaneswar Cleaning	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.3	16	Chandrasekharpur, Bhubaneswar	20.330099999999998	85.8195	Chandrasekharpur, Bhubaneswar	\N	Bhubaneswar	Odisha	751001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
e1d9c33b-4dbe-453a-b3a5-0bccee2a8a2a	PROVIDER	9201000006	provider.bbsr.carpentry@gharq.app	Bhubaneswar Carpenter	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.2	11	Unit 1 Market, Bhubaneswar	20.2701	85.8405	Unit 1 Market, Bhubaneswar	\N	Bhubaneswar	Odisha	751001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
233155bb-18b9-4549-9fc3-a2701833665b	CONSUMER	9102000001	consumer.sbp.1@gharq.app	Deepak Patel	$2b$12$7ZE3BlydU1lIi8mQyODQKenPjUUMDYBtANCzxs2JvZ.YulvuFDKEy	t	t	0	0	Gole Bazaar, Sambalpur	21.4669	83.9812	Gole Bazaar, Sambalpur	\N	Sambalpur	Odisha	768001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
7870aff3-900b-4388-9525-1a2105eed073	PROVIDER	9000000003	provider@localsync.app	Demo Provider	$2b$12$QbLNuwOx7hX/qCP/ea74D.CqQJE2a93UsbnvWxZCFHyPib4DYrHAe	t	t	0	0	Patia	20.357876518474185	85.8243038212434	\N	\N	D'Souza Layout	Bhubaneswar	751024	\N	2026-08-05 05:53:14.539314+00	2026-08-15 11:31:31.112191+00
7e2d3561-100a-4e38-84ed-1d1278e0e02b	CONSUMER	9101000001	consumer.bbsr.1@gharq.app	Ananya Mishra	$2b$12$7ZE3BlydU1lIi8mQyODQKenPjUUMDYBtANCzxs2JvZ.YulvuFDKEy	t	t	0	0	Saheed Nagar, Bhubaneswar	20.2961	85.8245	Saheed Nagar, Bhubaneswar	\N	Bhubaneswar	Odisha	751001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
f28444d3-c093-40c8-86e9-4c9cf1dd4b9a	CONSUMER	9101000002	consumer.bbsr.2@gharq.app	Priya Sahu	$2b$12$7ZE3BlydU1lIi8mQyODQKenPjUUMDYBtANCzxs2JvZ.YulvuFDKEy	t	t	0	0	Patia, Bhubaneswar	20.353099999999998	85.8235	Patia, Bhubaneswar	\N	Bhubaneswar	Odisha	751001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
7e4907b1-919c-411f-9c24-89ef290860f6	CONSUMER	9102000002	consumer.sbp.2@gharq.app	Sneha Pradhan	$2b$12$7ZE3BlydU1lIi8mQyODQKenPjUUMDYBtANCzxs2JvZ.YulvuFDKEy	t	t	0	0	Budharaja, Sambalpur	21.4789	83.9752	Budharaja, Sambalpur	\N	Sambalpur	Odisha	768001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
34beaec6-54e2-4978-8aaa-640e44ce8312	CONSUMER	9102000003	consumer.sbp.3@gharq.app	Amit Behera	$2b$12$7ZE3BlydU1lIi8mQyODQKenPjUUMDYBtANCzxs2JvZ.YulvuFDKEy	t	t	0	0	Ainthapali, Sambalpur	21.459899999999998	83.9902	Ainthapali, Sambalpur	\N	Sambalpur	Odisha	768001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
b562ee08-6cdb-4914-87a9-4c99ef122130	PROVIDER	9202000001	provider.sbp.plumbing@gharq.app	Sambalpur Plumber	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.7	28	Gole Bazaar, Sambalpur	21.4669	83.9812	Gole Bazaar, Sambalpur	\N	Sambalpur	Odisha	768001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
ddeef651-8c52-4fcf-a47f-10a975d5fa8b	CUSTOMER_SERVICE	9000000004	support@gharq.app	Gharq Customer Service	$2b$12$KTAvFXGC4zF.Xd4sOdUucO671403/.DK3nUEbMigfyU2JoHGxqK4m	t	t	0	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-08-11 11:56:56.56742+00	2026-08-17 15:11:20.574668+00
343818a3-43e0-4698-ac76-f74c4575e93b	PROVIDER	9202000002	provider.sbp.groceries@gharq.app	Sambalpur Kirana	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.5	41	Budharaja, Sambalpur	21.4789	83.9752	Budharaja, Sambalpur	\N	Sambalpur	Odisha	768001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
a23d3c79-4d1e-41ec-9969-633ff0424fe7	PROVIDER	9202000003	provider.sbp.electronics@gharq.app	Sambalpur Gadgets	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.4	19	Ainthapali, Sambalpur	21.459899999999998	83.9902	Ainthapali, Sambalpur	\N	Sambalpur	Odisha	768001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
242496fd-f68e-4d23-9ec2-93cf1fade99c	PROVIDER	9202000004	provider.sbp.electrical@gharq.app	Sambalpur Electrician	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.6	22	Remed, Sambalpur	21.4799	83.9702	Remed, Sambalpur	\N	Sambalpur	Odisha	768001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
63acc00e-b900-4233-bdd3-680174d37904	PROVIDER	9202000005	provider.sbp.cleaning@gharq.app	Sambalpur Cleaning	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.3	16	Dhanupali, Sambalpur	21.456899999999997	83.9892	Dhanupali, Sambalpur	\N	Sambalpur	Odisha	768001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
b3a5b701-c96e-4f6b-ac3e-7b69d140ae46	PROVIDER	9202000006	provider.sbp.carpentry@gharq.app	Sambalpur Carpenter	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.2	11	Khetrajpur, Sambalpur	21.4729	83.9932	Khetrajpur, Sambalpur	\N	Sambalpur	Odisha	768001	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
6ede7c12-5391-4f54-8b26-a6af8febbdf9	CONSUMER	9103000001	consumer.jsg.1@gharq.app	Kavita Naik	$2b$12$7ZE3BlydU1lIi8mQyODQKenPjUUMDYBtANCzxs2JvZ.YulvuFDKEy	t	t	0	0	Beheramal, Jharsuguda	21.8554	84.0062	Beheramal, Jharsuguda	\N	Jharsuguda	Odisha	768201	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
487b8fd5-2f0e-45d9-aadb-7c30d57d1df7	CONSUMER	9103000002	consumer.jsg.2@gharq.app	Manoj Kisan	$2b$12$7ZE3BlydU1lIi8mQyODQKenPjUUMDYBtANCzxs2JvZ.YulvuFDKEy	t	t	0	0	Sarbahal, Jharsuguda	21.8504	84.01520000000001	Sarbahal, Jharsuguda	\N	Jharsuguda	Odisha	768201	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
8dce3da1-df87-4246-8ba2-2a0a253d6884	CONSUMER	9103000003	consumer.jsg.3@gharq.app	Ritu Barik	$2b$12$7ZE3BlydU1lIi8mQyODQKenPjUUMDYBtANCzxs2JvZ.YulvuFDKEy	t	t	0	0	Brundamal, Jharsuguda	21.8604	83.99520000000001	Brundamal, Jharsuguda	\N	Jharsuguda	Odisha	768201	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
4181c42d-6015-4fa0-8e17-36579201041d	PROVIDER	9203000001	provider.jsg.plumbing@gharq.app	Jharsuguda Plumber	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.7	28	Beheramal, Jharsuguda	21.8554	84.0062	Beheramal, Jharsuguda	\N	Jharsuguda	Odisha	768201	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
a4743d86-2fc0-4d0a-b26f-e521a9c12ed8	PROVIDER	9203000002	provider.jsg.groceries@gharq.app	Jharsuguda Kirana	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.5	41	Sarbahal, Jharsuguda	21.8504	84.01520000000001	Sarbahal, Jharsuguda	\N	Jharsuguda	Odisha	768201	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
6bbae45c-d2d7-4a56-9c00-356c6717fa76	PROVIDER	9203000003	provider.jsg.electronics@gharq.app	Jharsuguda Gadgets	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.4	19	Brundamal, Jharsuguda	21.8604	83.99520000000001	Brundamal, Jharsuguda	\N	Jharsuguda	Odisha	768201	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
f10dc566-dc0c-4482-8b18-8e8f81bc5534	PROVIDER	9203000004	provider.jsg.electrical@gharq.app	Jharsuguda Electrician	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.6	22	H. Katapali, Jharsuguda	21.8654	84.0122	H. Katapali, Jharsuguda	\N	Jharsuguda	Odisha	768201	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
d3ba8e13-fd0b-4635-bf83-4d427d208a1b	PROVIDER	9203000005	provider.jsg.cleaning@gharq.app	Jharsuguda Cleaning	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.3	16	Marwari Para, Jharsuguda	21.8474	84.0022	Marwari Para, Jharsuguda	\N	Jharsuguda	Odisha	768201	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
04f06e57-0208-4588-9203-a4f4bbeafce3	PROVIDER	9203000006	provider.jsg.carpentry@gharq.app	Jharsuguda Carpenter	$2b$12$EocIFgOSmODH8OvA.gQM/OGs0LTmi4NhfsLSx1cKgsH/s1vizEKle	t	t	4.2	11	Chowk Bazaar, Jharsuguda	21.8584	84.01320000000001	Chowk Bazaar, Jharsuguda	\N	Jharsuguda	Odisha	768201	\N	2026-08-16 06:12:19.749505+00	2026-08-16 06:12:19.749505+00
\.


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categories_id_seq', 134, true);


--
-- Name: provider_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.provider_categories_id_seq', 1346, true);


--
-- Name: request_targets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.request_targets_id_seq', 3, true);


--
-- Name: admin_conversations admin_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_conversations
    ADD CONSTRAINT admin_conversations_pkey PRIMARY KEY (id);


--
-- Name: admin_messages admin_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_messages
    ADD CONSTRAINT admin_messages_pkey PRIMARY KEY (id);


--
-- Name: app_smtp_config app_smtp_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_smtp_config
    ADD CONSTRAINT app_smtp_config_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_stored_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_stored_name_key UNIQUE (stored_name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: inquiry_messages inquiry_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiry_messages
    ADD CONSTRAINT inquiry_messages_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_quote_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_quote_id_key UNIQUE (quote_id);


--
-- Name: provider_categories provider_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_categories
    ADD CONSTRAINT provider_categories_pkey PRIMARY KEY (id);


--
-- Name: provider_profiles provider_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_profiles
    ADD CONSTRAINT provider_profiles_pkey PRIMARY KEY (id);


--
-- Name: provider_profiles provider_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_profiles
    ADD CONSTRAINT provider_profiles_user_id_key UNIQUE (user_id);


--
-- Name: quotes quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);


--
-- Name: request_targets request_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_targets
    ADD CONSTRAINT request_targets_pkey PRIMARY KEY (id);


--
-- Name: service_requests service_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_pkey PRIMARY KEY (id);


--
-- Name: conversations uq_conversation_consumer_provider; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT uq_conversation_consumer_provider UNIQUE (consumer_id, provider_id);


--
-- Name: provider_categories uq_provider_category; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_categories
    ADD CONSTRAINT uq_provider_category UNIQUE (provider_id, category_id);


--
-- Name: quotes uq_quote_request_provider; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT uq_quote_request_provider UNIQUE (request_id, provider_id);


--
-- Name: ratings uq_rating_order_rater; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT uq_rating_order_rater UNIQUE (order_id, rater_id);


--
-- Name: request_targets uq_request_target_provider; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_targets
    ADD CONSTRAINT uq_request_target_provider UNIQUE (request_id, provider_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_provider_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_location ON public.provider_profiles USING gist (base_location);


--
-- Name: idx_provider_profiles_base_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_provider_profiles_base_location ON public.provider_profiles USING gist (base_location);


--
-- Name: idx_request_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_request_location ON public.service_requests USING gist (request_location);


--
-- Name: idx_service_requests_request_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_request_location ON public.service_requests USING gist (request_location);


--
-- Name: ix_admin_conversations_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_admin_conversations_provider_id ON public.admin_conversations USING btree (provider_id);


--
-- Name: ix_admin_messages_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_admin_messages_conversation_id ON public.admin_messages USING btree (conversation_id);


--
-- Name: ix_attachments_quote_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_attachments_quote_id ON public.attachments USING btree (quote_id);


--
-- Name: ix_attachments_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_attachments_request_id ON public.attachments USING btree (request_id);


--
-- Name: ix_attachments_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_attachments_uploaded_by ON public.attachments USING btree (uploaded_by);


--
-- Name: ix_categories_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_categories_parent_id ON public.categories USING btree (parent_id);


--
-- Name: ix_chat_messages_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chat_messages_order_id ON public.chat_messages USING btree (order_id);


--
-- Name: ix_conversations_consumer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conversations_consumer_id ON public.conversations USING btree (consumer_id);


--
-- Name: ix_conversations_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conversations_provider_id ON public.conversations USING btree (provider_id);


--
-- Name: ix_inquiry_messages_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_inquiry_messages_conversation_id ON public.inquiry_messages USING btree (conversation_id);


--
-- Name: ix_orders_consumer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_orders_consumer_id ON public.orders USING btree (consumer_id);


--
-- Name: ix_orders_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_orders_provider_id ON public.orders USING btree (provider_id);


--
-- Name: ix_orders_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_orders_request_id ON public.orders USING btree (request_id);


--
-- Name: ix_provider_categories_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_provider_categories_category_id ON public.provider_categories USING btree (category_id);


--
-- Name: ix_provider_categories_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_provider_categories_provider_id ON public.provider_categories USING btree (provider_id);


--
-- Name: ix_quotes_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_quotes_provider_id ON public.quotes USING btree (provider_id);


--
-- Name: ix_quotes_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_quotes_request_id ON public.quotes USING btree (request_id);


--
-- Name: ix_request_targets_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_request_targets_provider_id ON public.request_targets USING btree (provider_id);


--
-- Name: ix_request_targets_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_request_targets_request_id ON public.request_targets USING btree (request_id);


--
-- Name: ix_service_requests_consumer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_service_requests_consumer_id ON public.service_requests USING btree (consumer_id);


--
-- Name: ix_service_requests_request_pincode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_service_requests_request_pincode ON public.service_requests USING btree (request_pincode);


--
-- Name: ix_service_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_service_requests_status ON public.service_requests USING btree (status);


--
-- Name: ix_users_phone_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_phone_number ON public.users USING btree (phone_number);


--
-- Name: uq_provider_profiles_public_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_provider_profiles_public_slug ON public.provider_profiles USING btree (public_slug) WHERE (public_slug IS NOT NULL);


--
-- Name: admin_conversations admin_conversations_created_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_conversations
    ADD CONSTRAINT admin_conversations_created_by_admin_id_fkey FOREIGN KEY (created_by_admin_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: admin_conversations admin_conversations_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_conversations
    ADD CONSTRAINT admin_conversations_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: admin_messages admin_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_messages
    ADD CONSTRAINT admin_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.admin_conversations(id) ON DELETE CASCADE;


--
-- Name: admin_messages admin_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_messages
    ADD CONSTRAINT admin_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: attachments attachments_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: conversations conversations_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: conversations conversations_consumer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_consumer_id_fkey FOREIGN KEY (consumer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: inquiry_messages inquiry_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiry_messages
    ADD CONSTRAINT inquiry_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: inquiry_messages inquiry_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiry_messages
    ADD CONSTRAINT inquiry_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: orders orders_consumer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_consumer_id_fkey FOREIGN KEY (consumer_id) REFERENCES public.users(id);


--
-- Name: orders orders_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.users(id);


--
-- Name: orders orders_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE CASCADE;


--
-- Name: orders orders_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id);


--
-- Name: provider_categories provider_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_categories
    ADD CONSTRAINT provider_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: provider_categories provider_categories_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_categories
    ADD CONSTRAINT provider_categories_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.provider_profiles(id) ON DELETE CASCADE;


--
-- Name: provider_profiles provider_profiles_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_profiles
    ADD CONSTRAINT provider_profiles_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: provider_profiles provider_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.provider_profiles
    ADD CONSTRAINT provider_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: quotes quotes_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: quotes quotes_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotes
    ADD CONSTRAINT quotes_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_ratee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_ratee_id_fkey FOREIGN KEY (ratee_id) REFERENCES public.users(id);


--
-- Name: ratings ratings_rater_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_rater_id_fkey FOREIGN KEY (rater_id) REFERENCES public.users(id);


--
-- Name: request_targets request_targets_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_targets
    ADD CONSTRAINT request_targets_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: request_targets request_targets_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_targets
    ADD CONSTRAINT request_targets_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;


--
-- Name: service_requests service_requests_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: service_requests service_requests_consumer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_consumer_id_fkey FOREIGN KEY (consumer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

