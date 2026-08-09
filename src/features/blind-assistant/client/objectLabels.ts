const THAI_OBJECT_LABELS: Record<string, string> = {
    person: 'คน', bicycle: 'จักรยาน', car: 'รถยนต์', motorcycle: 'รถจักรยานยนต์', airplane: 'เครื่องบิน', bus: 'รถโดยสาร', train: 'รถไฟ', truck: 'รถบรรทุก', boat: 'เรือ',
    'traffic light': 'สัญญาณไฟจราจร', 'fire hydrant': 'หัวจ่ายน้ำดับเพลิง', 'stop sign': 'ป้ายหยุด', 'parking meter': 'มิเตอร์จอดรถ', bench: 'ม้านั่ง', bird: 'นก', cat: 'แมว', dog: 'สุนัข', horse: 'ม้า', sheep: 'แกะ', cow: 'วัว', elephant: 'ช้าง', bear: 'หมี', zebra: 'ม้าลาย', giraffe: 'ยีราฟ',
    backpack: 'กระเป๋าเป้', umbrella: 'ร่ม', handbag: 'กระเป๋าถือ', tie: 'เนกไท', suitcase: 'กระเป๋าเดินทาง', frisbee: 'จานร่อน', skis: 'สกี', snowboard: 'สโนว์บอร์ด', 'sports ball': 'ลูกบอล', kite: 'ว่าว', 'baseball bat': 'ไม้เบสบอล', 'baseball glove': 'ถุงมือเบสบอล', skateboard: 'สเกตบอร์ด', surfboard: 'กระดานโต้คลื่น', 'tennis racket': 'ไม้เทนนิส',
    bottle: 'ขวด', 'wine glass': 'แก้วไวน์', cup: 'แก้วน้ำ', fork: 'ส้อม', knife: 'มีด', spoon: 'ช้อน', bowl: 'ชาม', banana: 'กล้วย', apple: 'แอปเปิล', sandwich: 'แซนด์วิช', orange: 'ส้ม', broccoli: 'บรอกโคลี', carrot: 'แครอท', 'hot dog': 'ฮอตดอก', pizza: 'พิซซ่า', donut: 'โดนัท', cake: 'เค้ก',
    chair: 'เก้าอี้', couch: 'โซฟา', 'potted plant': 'ต้นไม้กระถาง', bed: 'เตียง', 'dining table': 'โต๊ะอาหาร', toilet: 'โถสุขภัณฑ์', tv: 'โทรทัศน์', laptop: 'แล็ปท็อป', mouse: 'เมาส์', remote: 'รีโมต', keyboard: 'แป้นพิมพ์', 'cell phone': 'โทรศัพท์มือถือ', microwave: 'ไมโครเวฟ', oven: 'เตาอบ', toaster: 'เครื่องปิ้งขนมปัง', sink: 'อ่างล้างจาน', refrigerator: 'ตู้เย็น', book: 'หนังสือ', clock: 'นาฬิกา', vase: 'แจกัน', scissors: 'กรรไกร', 'teddy bear': 'ตุ๊กตาหมี', 'hair drier': 'ไดร์เป่าผม', toothbrush: 'แปรงสีฟัน',
};

export function getObjectLabel(className: string): string {
    return THAI_OBJECT_LABELS[className] || className;
}
