import type { Plan } from '../core/types';

/** Wire types of the backend (backend/app/schemas). Field names are camelCase on the wire. */

/** Subscription tiers (backend/app/tiers.py); names, prices and texts — src/lib/tiers.ts. */
export type TierId = 'free' | 'pro' | 'custom';

export interface TierLimits {
  /** Saved plans; null — unlimited. */
  plans: number | null;
  /** Vehicles and cargo items in one plan. */
  vehicles: number;
  items: number;
  autoload: boolean;
  pdfSteps: boolean;
}

export interface Subscription {
  /** The tier that applies now (an expired paid tier is "free"). */
  tier: TierId;
  name: string;
  expiresAt: string | null;
  trial: boolean;
  trialAvailable: boolean;
  /** A paid tier that has ended and works as "free" until renewed. */
  expiredTier: TierId | null;
  limits: TierLimits;
}

/** How much of the tier's limits the account uses (GET /api/users/me/usage, tiers on only). */
export interface Usage {
  /** Saved plans. */
  plans: number;
  /** The most vehicles and cargo items in one plan: the limits are per plan. */
  maxVehicles: number;
  maxItems: number;
  /** Plans with more vehicles or items than the tier allows: they open and can be edited, but do not grow. */
  overLimit: number;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  isAdmin: boolean;
  /** false: the email is not confirmed yet — the app shows the code screen, plans are closed. */
  emailVerified: boolean;
  /** Editor display settings as last saved; null — never changed. */
  settings: Record<string, unknown> | null;
  /** null when tiers are off (TIERS_ENABLED): nothing is limited. */
  subscription: Subscription | null;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'bearer';
  expiresIn: number;
  user: User;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
}

export interface PlanSummary {
  id: string;
  name: string;
  version: number;
  vehicleCount: number;
  bodyCount: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  /** When the preview picture was last replaced; null — none yet. */
  thumbnailAt: string | null;
}

export interface PlanRecord extends PlanSummary {
  data: Plan;
}

export interface PlanPage {
  items: PlanSummary[];
  total: number;
  limit: number;
  offset: number;
}

export type PlanSort = 'updatedAt' | '-updatedAt' | 'createdAt' | '-createdAt' | 'name' | '-name';

/** A request from the landing page or the account page. */
export interface LeadInput {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  message?: string;
  tier?: TierId;
  /** Honeypot: stays empty for people. */
  website?: string;
}

// ------------------------------------------------------------------ admin panel

/** «Индивидуальный» limits; null / missing — no limit. */
export interface CustomLimits {
  plans?: number | null;
  vehicles?: number | null;
  items?: number | null;
}

export interface AdminSubscription {
  tier: TierId;
  effectiveTier: TierId;
  expiresAt: string | null;
  trial: boolean;
  trialUsed: boolean;
  limits: CustomLimits | null;
  note: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  lastActiveAt: string | null;
  planCount: number;
  sessionCount: number;
  /** null when tiers are off. */
  subscription: AdminSubscription | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export type AdminUserSort = 'createdAt' | '-createdAt' | 'email' | '-lastActiveAt';
export type AdminUserStatus = 'active' | 'blocked' | 'admins';

export interface AdminStats {
  users: number;
  newLast7Days: number;
  activeLast7Days: number;
  blocked: number;
  admins: number;
  /** null when tiers are off. */
  byTier: Record<TierId, number> | null;
  plans: number;
  newLeads: number;
}

export interface SubscriptionInput {
  tier: TierId;
  expiresAt: string | null;
  trial: boolean;
  limits: CustomLimits | null;
  note: string | null;
}

export type LeadStatus = 'new' | 'done';

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
  tier: TierId | null;
  status: LeadStatus;
  userId: string | null;
  createdAt: string;
}

/** Online payment of tiers (backend/app/billing.py). */
export type BillingPeriod = 'month' | 'year';
export type PaymentStatus = 'pending' | 'paid' | 'canceled';

export interface Price {
  tier: 'pro';
  period: BillingPeriod;
  /** Roubles for the whole period. */
  amount: number;
  months: number;
}

export interface BillingInfo {
  /** Tiers can be paid online (TIERS_ENABLED and a PAYMENT_PROVIDER); otherwise — by a request. */
  enabled: boolean;
  /** What is charged: the server's prices. */
  prices: Price[];
}

export interface Payment {
  id: string;
  tier: string;
  period: BillingPeriod;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
  /** The end of the paid period this payment gave. */
  paidUntil: string | null;
}

export interface Checkout {
  payment: Payment;
  /** The provider's page where the customer pays: open it. */
  paymentUrl: string;
}

export interface AdminPayment extends Payment {
  email: string;
  userId: string | null;
  provider: string;
}

export interface AdminPaymentPage extends Page<AdminPayment> {
  /** Roubles received in total. */
  paidSum: number;
}

/** Visit statistics of the public pages (backend/app/analytics.py, GET /api/admin/analytics). */
export interface AnalyticsSummary {
  visits: number;
  /** Unique per day, summed over the days. */
  visitors: number;
  pageviews: number;
  avgEngagedMs: number;
  medianEngagedMs: number;
  bounceRate: number;
  signups: number;
  conversion: number;
}

export interface AnalyticsBreakdown {
  key: string;
  visits: number;
  signups: number;
  avgEngagedMs: number;
}

export interface AnalyticsRecentVisit {
  startedAt: string;
  channel: string;
  source: string | null;
  searchEngine: string | null;
  /** Pages in the order opened, up to 8. */
  pages: string[];
  engagedMs: number;
  device: string;
  browser: string;
  os: string;
  signedUp: boolean;
  live: boolean;
}

export interface AnalyticsReport {
  days: 7 | 30 | 90;
  since: string;
  summary: AnalyticsSummary;
  previous: AnalyticsSummary;
  daily: Array<{ date: string; visits: number; visitors: number; signups: number; avgEngagedMs: number; bounces: number }>;
  /** Visits active within the last 5 minutes. */
  live: number;
  funnel: Array<{ step: 'landing' | 'pricing' | 'signup_click' | 'signup'; visits: number }>;
  /** The latest visits of the period, newest first. */
  recent: AnalyticsRecentVisit[];
  channels: AnalyticsBreakdown[];
  sources: AnalyticsBreakdown[];
  searchEngines: AnalyticsBreakdown[];
  campaigns: AnalyticsBreakdown[];
  keywords: AnalyticsBreakdown[];
  entryPages: AnalyticsBreakdown[];
  devices: AnalyticsBreakdown[];
  browsers: AnalyticsBreakdown[];
  systems: AnalyticsBreakdown[];
  durations: Array<{ label: string; visits: number }>;
  pages: Array<{ path: string; views: number; visits: number }>;
  landingVisits: number;
  sections: Array<{ section: string; visits: number; reach: number; avgMs: number }>;
  clicks: Array<{ name: string; clicks: number; visits: number }>;
}
