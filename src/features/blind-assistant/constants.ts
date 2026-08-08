export const MODES = {
    ASSISTANT: 'assistant',
    CURRENCY: 'currency',
    READER: 'reader',
} as const;

export type Mode = typeof MODES[keyof typeof MODES];

export const CAMERA_CONFIG = {
    FACING_MODE: 'environment',
    ASPECT_RATIO: 16 / 9,
    FRAME_RATE: { ideal: 30, max: 60 },
} as const;
