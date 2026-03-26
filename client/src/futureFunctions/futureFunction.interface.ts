export interface FutureFunction {
  id: number;
  name: string;
  priority: string;
  complexity: string;
  phase: string;
  info: string;
  status: string;
  archived: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  completedAt?: string | null;
}

export interface FutureFunctionDraft {
  name: string;
  priority: string;
  complexity: string;
  phase: string;
  info: string;
  status: string;
  archived: boolean;
}
