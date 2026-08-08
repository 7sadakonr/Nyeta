/**
 * Component interface definitions & ref handles.
 */

export interface HapticFeedbackHandle {
  trigger: (times?: number, interval?: number) => Promise<void>;
  clickSwitch: () => void;
  startContinuous: () => void;
  stopContinuous: () => void;
}

export interface HapticFeedbackProps {
  id?: string;
}
