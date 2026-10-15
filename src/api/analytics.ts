import { getJson, hasKeys } from "./http.js";
import { signedHeaders } from "./signing.js";

export interface RecentPayment {
  payerAddress: string;
  amount: string;
  paidAt: string;
}

export interface ResourceStat {
  id: string;
  title: string;
  price: string;
  accessUrl: string;
  verificationStatus: string;
  listed: boolean;
  createdAt: string;
  totalSales: number;
  totalEarned: string;
  recentPayments: RecentPayment[];
}

export interface AnalyticsData {
  summary: {
    totalEarned: string;
    currency: string;
    totalSales: number;
    totalResources: number;
    listedResources: number;
    verification: { verified: number; rejected: number; pending: number };
  };
  resources: ResourceStat[];
}

export async function fetchAnalytics(apiKey: string): Promise<AnalyticsData> {
  return getJson<AnalyticsData>(
    "/publishers/me/analytics",
    "Failed to load analytics",
    { headers: signedHeaders(apiKey) },
    hasKeys("summary", "resources"),
  );
}