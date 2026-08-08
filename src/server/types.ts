/**
 * Server-side and API route type definitions.
 */
import { CallRecord } from '@/features/calling/types';
import { UserRole } from '@/shared/types/user';

export type { UserRole };

export interface SessionPayload {
  userId: string;
  role: UserRole;
  exp: number;
  iat: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export interface ClaimCallResult {
  success: boolean;
  call?: CallRecord;
  reason?: string;
}

export interface GeminiApiRequestBody {
  image?: string;
  question?: string;
  mode?: 'assistant' | 'reader' | 'currency';
  history?: Array<{ role: string; content: string }>;
}
