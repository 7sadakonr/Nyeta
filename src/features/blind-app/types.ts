import type { CallStatus } from '@/features/calling/types';

export type BlindAppTab = 'assistant' | 'currency' | 'reader' | 'volunteer';

export const ASSISTANT_TABS = ['assistant', 'currency', 'reader'] as const;

export const ACTIVE_CALL_STATUSES: readonly CallStatus[] = ['calling', 'connecting', 'connected'];
