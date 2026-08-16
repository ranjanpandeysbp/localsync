export type ConsumerNavItem = {
  to: string;
  label: string;
  end?: boolean;
};

/** Shared consumer navigation for landing shell and AppShell. */
export const CONSUMER_NAV: ConsumerNavItem[] = [
  { to: "/", label: "Home", end: true },
  { to: "/consumer/details", label: "My Account" },
  { to: "/consumer/requests", label: "My requests" },
  { to: "/consumer/post", label: "Broadcast request" },
  { to: "/consumer/inquiries", label: "Recent inquiries" },
  { to: "/consumer/quotes", label: "Received Quotes" },
  { to: "/consumer/orders", label: "Orders" },
];
