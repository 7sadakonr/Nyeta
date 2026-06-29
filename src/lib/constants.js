export const MODE_LABELS = {
    assistant: 'โหมดผู้ช่วย AI',
    currency: 'โหมดดูสกุลเงิน',
    reader: 'โหมดอ่านเอกสาร',
};

export const MODE_STORAGE_KEY = 'nyeta-blind-mode';
export const VALID_MODES = ['assistant', 'currency', 'reader'];

export const QUICK_MESSAGES = [
    "ซ้ายหน่อย",
    "ขวาหน่อย",
    "ยกกล้องขึ้น",
    "เอากล้องลง",
    "เดินหน้า",
    "หยุดตรงนี้",
    "ถือนิ่งๆ นะ",
    "ดีมาก"
];

export const STATUS_SPEECH = {
    calling: 'กำลังเรียกอาสาสมัคร กรุณารอสักครู่',
    connecting: 'อาสาสมัครรับสายแล้ว กำลังเชื่อมต่อ',
    connected: 'เชื่อมต่อแล้ว เริ่มพูดคุยได้เลย',
    'no-answer': 'ขออภัย ไม่มีอาสาสมัครว่างในขณะนี้ กรุณาลองใหม่อีกครั้ง',
    ended: 'วางสายแล้ว',
    error: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
};

export const DETECTION_INTERVAL_MS = 1000;
export const CURRENCY_SCAN_INTERVAL_MS = 4000;
export const PAGE_SCAN_INTERVAL_MS = 500;
