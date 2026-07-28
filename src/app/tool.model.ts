// Mirrors the Tool entity returned by the DevStack API.
export interface Tool {
  id: number;
  name: string;
  category: string;
  url?: string | null;
  notes?: string | null;
  isPaid: boolean;
  monthlyCost?: number | null;
  currency: string;
  projects?: string | null;
  createdAt: string;
}
