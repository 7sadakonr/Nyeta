/**
 * Type definitions for Blind Assistant modes, detections, chats, and scanners.
 */

export type BlindMode = 'assistant' | 'currency' | 'reader';
export type AssistantMode = BlindMode;

export type AssistantStatus = 'idle' | 'capturing' | 'thinking' | 'speaking' | 'error';

export interface AssistantMessage {
  role: 'user' | 'ai' | 'model';
  content: string;
  image?: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedObject {
  bbox: [number, number, number, number]; // [x, y, width, height]
  class: string;
  score: number;
  distance?: number;
}

export type CocoDetection = DetectedObject;

export interface DetectedCenterObject extends DetectedObject {
  distance: number;
}

export interface DetectionGuidance {
  direction: string;
  message: string;
  distance?: number;
}

export type ObjectGuidance = DetectionGuidance;

export type ChatRole = 'user' | 'assistant' | 'volunteer' | 'system' | 'ai' | 'model';

export interface ChatMessage {
  id?: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  image?: string;
  isError?: boolean;
}

export interface CurrencyItem {
  type: 'banknote' | 'coin' | string;
  amount: number;
  currency: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface CurrencyDetection {
  type: string;
  value: number;
  isBlocked?: boolean;
  source?: string;
  confidence?: number;
}

export interface ScannedItem {
  id: number;
  type: string;
  value: number;
  timestamp: number;
}

export interface CurrencyDetectionResult {
  raw: string;
  summary: string;
  total: number;
  items: CurrencyItem[];
  confidence: 'high' | 'medium' | 'low' | 'none';
}

export interface Point2D {
  x: number;
  y: number;
}

export interface QuadCorners {
  tl: Point2D;
  tr: Point2D;
  br: Point2D;
  bl: Point2D;
}

export interface DocumentScanMetrics {
  coverage: number;
  skewAngle: number;
  aspectRatio: number;
  aspectRatioOk: boolean;
  centered: boolean;
  skewOk: boolean;
  coverageOk: boolean;
}

export interface DocumentScanDetection {
  hasDocument: boolean;
  bounds: BoundingBox | null;
  corners: QuadCorners | null;
  aligned: boolean;
  guidance: string;
  metrics: DocumentScanMetrics | null;
}
