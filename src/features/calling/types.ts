/**
 * Type definitions for WebRTC volunteer call signaling and state.
 */

export type CallStatus = 
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'no-answer'
  | 'error'
  | 'online'
  | 'offline'
  | 'pending'
  | 'claimed'
  | 'cancelled';

export interface IncomingCall {
  callId: string;
}

export interface CallRecord {
  callId: string;
  status: CallStatus;
  blindUserId: string;
  claimedBy: string | null;
  createdAt: number;
  claimedAt: number | null;
  endedAt?: number | null;
  cancelledAt?: number | null;
  expiresAt?: number;
}

export interface IncomingCallEventData {
  callId: string;
  blindUserId?: string;
  createdAt?: number;
}

export interface CallClaimedEventData {
  callId: string;
  volunteerId: string;
}

export interface CallAcceptedEventData {
  callId: string;
  volunteerId: string;
}

export interface CallEndedEventData {
  callId: string;
  reason?: string;
}

export interface SdpEventData {
  sdp: RTCSessionDescriptionInit;
}

export interface IceCandidateEventData {
  candidate: RTCIceCandidateInit;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type PeerConnectionState = 
  | 'idle'
  | 'creating'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';
