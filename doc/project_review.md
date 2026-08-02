# Nyeta Project Review & Road to Production

เอกสารนี้รวบรวมสิ่งที่โปรเจกต์ Nyeta ควรต้องปรับปรุงเพิ่มเติม เพื่อให้แอปพลิเคชันมีความสมบูรณ์ เสถียร และปลอดภัยพร้อมสำหรับการใช้งานจริง (Production-ready)

---

## 🐛 Bugs ที่พบ (ต้องแก้)

### Bug 1 — `useSpeechInput.js` : ไมค์และ TTS ทำงานพร้อมกันได้
- **ไฟล์:** `src/hooks/useSpeechInput.js` บรรทัด 68–77
- **ปัญหา:** `startListening()` ไม่ได้สั่ง `speechManager.stopAll()` ก่อนเปิดไมค์ — ผู้ใช้อาจกดไมค์ขณะที่ AI กำลังพูดอยู่ ทำให้ไมค์รับเสียง TTS เข้าไปด้วย และกลายเป็น feedback loop
- **วิธีแก้:** เพิ่ม `speechManager?.stopAll()` ก่อน `recognitionRef.current.start()`

### Bug 2 — `useCamera.js` : ไม่มี UI เมื่อ user deny กล้อง
- **ไฟล์:** `src/hooks/useCamera.js` บรรทัด 46–49
- **ปัญหา:** เมื่อ user กด "ไม่อนุญาต" ให้ใช้กล้อง แอปจะค้างอยู่สถานะ "กำลังเริ่ม..." ไม่มีเสียงแจ้งเตือน ไม่มีปุ่มลองใหม่ — ผู้พิการทางสายตาจะไม่รู้ว่าเกิดอะไรขึ้น
- **วิธีแก้:** ใน `blind/page.js` ดัก `error` ที่ return จาก `useCamera()` แล้วพูดออกเสียงด้วย CRITICAL priority และแสดง UI ปุ่ม "ลองใหม่"

### Bug 3 — `blind/page.js` : `prevMessagesLenRef` ไม่ reset เมื่อ `clearMessages()`
- **ไฟล์:** `src/app/blind/page.js` บรรทัด 143–160
- **ปัญหา:** เมื่อกดปุ่ม "ล้างแชท" (`clearMessages()`) ทำให้ `aiMessages` กลับเป็น `[]` แต่ `prevMessagesLenRef.current` ยังมีค่าเดิม ทำให้ครั้งถัดไปที่ AI ตอบกลับ ระบบเปรียบเทียบผิด และไม่พูด AI response ออกเสียง
- **วิธีแก้:** เมื่อเรียก `clearMessages()` ให้ reset `prevMessagesLenRef.current = 0` ด้วย

### Bug 4 — `ErrorBoundary.js` : แสดง error แค่ทางสายตา ไม่พูดออกเสียง
- **ไฟล์:** `src/components/ErrorBoundary.js` บรรทัด 15–18
- **ปัญหา:** เมื่อเกิด React crash `componentDidCatch` แค่ `console.error` — ผู้พิการทางสายตาจะไม่รู้ว่าแอปล่ม
- **วิธีแก้:** ใน `componentDidCatch` เพิ่ม `speechManager?.speak('เกิดข้อผิดพลาดร้ายแรง กรุณารีเฟรชหน้า', { priority: Priority.CRITICAL, owner: 'error-boundary' })` และ `navigator.vibrate?.([200,100,200,100,200])`

### Bug 5 — `BlindChatOverlay.js` : `onSendMessage` ใน dep array ทำให้ Speech Recognition สร้างใหม่ทุกครั้ง
- **ไฟล์:** `src/components/BlindChatOverlay.js` บรรทัด 53–83
- **ปัญหา:** `useEffect` ที่ setup SpeechRecognition มี `onSendMessage` ใน dependency array — ทุกครั้งที่ parent re-render และ `onSendMessage` reference เปลี่ยน recognition จะถูกสร้างใหม่ อาจทำให้ recognition ขาดช่วง
- **วิธีแก้:** ใช้ `useRef` เก็บ `onSendMessage` แล้วลบออกจาก dep array (เหมือนที่ `useSpeechInput.js` ทำ)

### Bug 6 — `useDocumentReader.js` : Auto-capture ไม่ทำงานอีกครั้งหลังกดอ่านด้วยมือ
- **ไฟล์:** `src/hooks/useDocumentReader.js` บรรทัด 34–74
- **ปัญหา:** `autoCaptureFiredRef.current = true` ถูก set ใน `readDocument()` แต่ `resetDocument()` ก็ reset มันกลับเป็น `false` — อย่างไรก็ตาม ถ้าผู้ใช้กดถ่ายเอกสารใหม่โดยไม่ผ่าน `resetDocument()` ระบบ auto-capture จะไม่ทำงานอีก เพราะ `docTextRef.current` ยังมีข้อความเก่าอยู่ (condition `!docTextRef.current` fail)
- **วิธีแก้:** ใน `readDocument()` ให้ reset `autoCaptureFiredRef.current = false` ที่ต้นฟังก์ชัน แล้วค่อย set เป็น `true` หลังจากเริ่มกระบวนการจริง

### Bug 7 — `useCamera.js` : `isReady` ถูก set เป็น `true` ก่อนที่ video จะ play จริง
- **ไฟล์:** `src/hooks/useCamera.js` บรรทัด 38–44
- **ปัญหา:** `setIsReady(true)` ถูกเรียกทันทีหลัง `setStream()` แต่ video element ยังไม่ play — `isReady = true` ทำให้ AI hooks เริ่มทำงาน แต่ `videoRef.current.readyState` ยังเป็น 0 ทำให้ capture ล้มเหลวครั้งแรก
- **วิธีแก้:** ย้าย `setIsReady(true)` ไปไว้ใน callback `onloadedmetadata` หรือ `oncanplay`

### Bug 8 — `page.js` (Home) : ไม่มีเสียงต้อนรับสำหรับผู้พิการ
- **ไฟล์:** `src/app/page.js`
- **ปัญหา:** หน้าหลักไม่มี auto-speak ต้อนรับ ผู้พิการที่เปิดแอปครั้งแรกไม่รู้ว่ามีอะไรบนหน้าจอ — พึ่ง VoiceOver/TalkBack ของ OS เท่านั้น ซึ่งอาจช้า
- **วิธีแก้:** เพิ่ม `useEffect` ที่ mount เพื่อพูด "ยินดีต้อนรับสู่ Nyeta ผู้ช่วย AI สำหรับผู้พิการทางสายตา กดปุ่มผู้ช่วย AI หรือกดปุ่มโทรหาอาสาสมัคร"

### Bug 9 — ไม่มีการตรวจสอบ Network Status
- **ไฟล์:** ไม่มีในไฟล์ใดเลย
- **ปัญหา:** เมื่อเน็ตหลุดขณะใช้งาน (AI กำลัง fetch, currency scanner กำลัง scan) — แอปจะเงียบหรือแสดง generic error โดยไม่บอกผู้ใช้ว่าเน็ตหาย
- **วิธีแก้:** เพิ่ม `window.addEventListener('offline', ...)` ใน `blind/page.js` แล้วพูดออกเสียง "ไม่มีการเชื่อมต่ออินเทอร์เน็ต" ด้วย CRITICAL priority

---

## ✨ Feature ที่ขาดหายไป (ควรเพิ่ม)

### Feature 1 — ปุ่มหยุดเสียง AI Global
- **ปัญหา:** เมื่อ AI ตอบกลับข้อความยาวและกำลังพูดอยู่ ไม่มีปุ่มหยุดเสียงใน `mode === 'assistant'`
- **วิธีแก้:** เพิ่มปุ่ม "หยุดเสียง" ใน `ControlBar.js` สำหรับ mode assistant ที่ active เมื่อ `speechManager.isSpeaking && speechManager.currentOwner === 'ai-assistant'`

### Feature 2 — แจ้งเตือน Push Notification สำหรับอาสาสมัคร
- **ปัญหา:** ถ้าอาสาสมัครพับแท็บ จะไม่ได้รับแจ้งเตือนเมื่อมีสายเข้า
- **วิธีแก้:** ใช้ Web Push API ใน `useVolunteerHelp.js`

### Feature 3 — Camera Permission Retry UI
- **ปัญหา:** ถ้า user deny กล้อง ไม่มีทางกลับมาขออนุญาตใหม่ได้
- **วิธีแก้:** แสดงหน้า fallback พร้อมปุ่ม "ลองใหม่" และคำแนะนำวิธีเปิดสิทธิ์กล้องในการตั้งค่า

### Feature 4 — ปุ่มโหมด Landscape / Portrait Awareness
- **ปัญหา:** ไม่มีการจัดการเมื่อหมุนหน้าจอ layout อาจพัง
- **วิธีแก้:** เพิ่ม `orientation` event listener และ lock screen orientation ใน `useCamera`

---

---

## 1. ความปลอดภัย (Security & API Keys)
**ปัญหาปัจจุบัน:** มีการเรียกใช้ AI API (Gemini/Groq) ผ่านฝั่ง Client โดยใช้ `NEXT_PUBLIC_GEMINI_API_KEY` ทำให้ API Key ถูกเปิดเผยให้คนที่สามารถดู Source Code สามารถนำคีย์ไปใช้งานได้
**วิธีแก้:**
- ย้ายการเรียก API ทั้งหมดไปที่ฝั่ง Server-side (เช่น สร้างโฟลเดอร์ `src/app/api/gemini/route.js`)
- Client จะส่งภาพ/ข้อความมาที่ API ภายในของแอปพลิเคชันแทน เพื่อซ่อน API Key ของจริงไว้ที่ Server

## 2. การจัดการเมื่อเกิดข้อผิดพลาด (Robust Error Handling)
**ปัญหาปัจจุบัน:** ระบบยังจัดการข้อผิดพลาดได้จำกัด บางครั้งถ้าเน็ตหลุด หรือเกิดเหตุไม่คาดฝัน แอปอาจจะค้างอยู่สถานะเดิม
**วิธีแก้:**
- **Network Drops:** เพิ่มการตรวจจับ `navigator.onLine` ถ้าเน็ตหลุดให้แจ้งเตือนผู้พิการทันทีด้วยระดับ `Priority.CRITICAL`
- **Camera Permissions:** ตรวจสอบและจัดการกรณีที่ผู้ใช้เผลอกด "ไม่อนุญาต" (Deny) ให้ใช้กล้อง/ไมค์ โดยมีปุ่มรีเฟรชหรือคำแนะนำที่ชัดเจน
- **WebRTC Auto-reconnect:** หากสายหลุด (ICE connection failed) ระหว่างโทรหาอาสาสมัคร ควรมีระบบพยายามเชื่อมต่อใหม่ (Auto-reconnect) อัตโนมัติ

## 3. ประสิทธิภาพและการทำงานแบบออฟไลน์ (Performance & PWA)
**ปัญหาปัจจุบัน:** มีไฟล์ `manifest.webmanifest` แต่ยังไม่มี Service Worker ทำให้ไม่สามารถแคชไฟล์ไว้ใช้แบบออฟไลน์ได้ 
**วิธีแก้:**
- **PWA (Progressive Web App):** เพิ่ม Service Worker (เช่น ใช้ `next-pwa`) เพื่อให้แคช UI, ไฟล์เสียง (Earcons) และโมเดล AI ไว้ในเครื่อง เพื่อให้แอปโหลดเร็วขึ้นและลดการใช้เน็ต
- **Tensorflow.js:** โมเดล COCO-SSD ที่ใช้ใน `useObjectDetector.js` มีขนาดใหญ่ ควรจัดการแคชโมเดลนี้ลง CacheStorage เพื่อไม่ให้ต้องโหลดใหม่ทุกครั้งที่เปิดแอป

## 4. โหมดประหยัดพลังงาน (Battery & Thermal Management)
**ปัญหาปัจจุบัน:** การใช้กล้องตลอดเวลา, รัน AI, และ WebRTC ค่อนข้างกินแบตเตอรี่เครื่องและทำให้เครื่องร้อน
**วิธีแก้:**
- ปรับลด Frame Rate หรือความละเอียด (Resolution) ของกล้องในโหมดที่ไม่ได้ต้องการความแม่นยำสูงสุด
- หยุดการทำงานของ Object Detector ชั่วคราวหากผู้ใช้ไม่ได้ขยับกล้องเป็นระยะเวลาหนึ่ง (Motion detection check)

## 5. ประสบการณ์ของผู้ใช้อาสาสมัคร (Volunteer UX & A11y)
**ปัญหาปัจจุบัน:** ระบบเน้นความสามารถฝั่งผู้พิการ (Blind) เป็นหลัก หน้าตาฝั่งอาสาสมัครยังค่อนข้างพื้นฐานและไม่ได้รองรับ Accessibility เต็มที่
**วิธีแก้:**
- **Push Notifications:** เพิ่ม Web Push Notification คอยเตือนอาสาสมัครเมื่อมีสายเรียกเข้า แม้ว่าจะพับหน้าจออยู่
- **Accessibility:** เพิ่ม aria-label, aria-live, และการจัดการ Focus (Focus management) ที่ดีขึ้นในหน้าอาสาสมัคร เพื่อให้อาสาสมัครที่ใช้ Screen Reader สามารถช่วยเหลือผู้พิการได้เช่นกัน

## 6. การทดสอบอัตโนมัติ (Automated Testing)
**ปัญหาปัจจุบัน:** ยังไม่มีระบบเทสต์ ทำให้การเพิ่มฟีเจอร์ใหม่เสี่ยงที่จะกระทบกับฟีเจอร์เดิม (เช่น ปัญหาเสียงซ้อนที่เพิ่งถูกแก้ไข)
**วิธีแก้:**
- เพิ่ม **Unit Tests** (เช่น Jest, Vitest) เพื่อทดสอบลอจิกใน Hooks (`useSpeechInput`, `useAiAssistant`) 
- เพิ่ม **E2E Tests** (เช่น Playwright, Cypress) เพื่อจำลองการเชื่อมต่อ WebRTC ระหว่าง 2 เบราว์เซอร์ว่าสามารถคุยกันได้จริง

---
**สรุปความสำคัญ:**
สิ่งที่ควรทำเป็นอันดับแรกสุด (Priority 1) คือ **ข้อ 1 (ย้าย API Key ไป Server)** และ **ข้อ 2 (จัดการ Error/สายหลุด)** เนื่องจากส่งผลโดยตรงต่อความปลอดภัยและการใช้งานขั้นพื้นฐานของผู้พิการ
