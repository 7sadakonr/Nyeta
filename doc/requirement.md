# ความต้องการของระบบ (System Requirements)

เอกสารนี้รวบรวมเทคโนโลยี ไลบรารี และข้อกำหนดด้านฮาร์ดแวร์ที่จำเป็นสำหรับการทำงานของแอปพลิเคชัน Nyeta

## 1. เทคโนโลยีหลัก (Core Technologies)
*   **Framework:** [Next.js](https://nextjs.org/) (เวอร์ชัน 16.1.1) - ใช้ App Router เป็นแกนหลักของการทำงานทั้งฝั่ง Client และ Server
*   **UI Library:** [React](https://react.dev/) (เวอร์ชัน 19.0.0)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/) (เวอร์ชัน 4.0.0) สำหรับการออกแบบ UI ที่รองรับการใช้งานผ่านหน้าจอสัมผัส (Touch Targets ขนาดใหญ่)

## 2. ไลบรารีที่เกี่ยวข้องกับ AI และ Computer Vision (Machine Learning)
*   **@tensorflow/tfjs:** TensorFlow.js (เวอร์ชัน ^4.22.0) สำหรับรันโมเดล AI บนเบราว์เซอร์
*   **@tensorflow-models/coco-ssd:** โมเดลสำหรับการตรวจจับวัตถุ (Object Detection) แบบเรียลไทม์ผ่านกล้อง
*   **scanic:** (เวอร์ชัน ^1.0.8) ไลบรารีช่วยในการสแกนและประมวลผลขอบภาพ (Edge Detection) สำหรับโหมดอ่านเอกสาร

## 3. ระบบสื่อสารและเชื่อมต่อ (Communication & Real-time)
*   **Pusher:** ใช้สร้างห้องและจัดการ Signaling ของ WebRTC (เวอร์ชัน ^5.3.4 สำหรับฝั่ง Server และ pusher-js ^8.5.0 สำหรับฝั่ง Client) สำหรับโหมดอาสาสมัคร (Volunteer Call)
*   **WebRTC:** มาตรฐานการสื่อสารแบบ Peer-to-Peer สำหรับการสตรีมวิดีโอและเสียงระหว่างผู้พิการทางสายตาและอาสาสมัคร

## 4. API ภายนอก (External APIs)
*   **Groq API (Vision Model):** ใช้โมเดล Multimodal AI (เช่น LLaVA หรือเทียบเท่า) สำหรับวิเคราะห์รูปภาพในโหมด AI Assistant, การทำ OCR ในโหมดเอกสาร และจำแนกธนบัตร
*   **Web Speech API:**
    *   *SpeechRecognition:* ใช้ในการรับคำสั่งเสียงจากผู้ใช้ (Speech-to-Text)
    *   *SpeechSynthesis:* ใช้ในการอ่านข้อความออกเสียง (Text-to-Speech / TTS)

## 5. ข้อกำหนดด้านอุปกรณ์ฮาร์ดแวร์ (Hardware Requirements)
สำหรับการใช้งานผ่านอุปกรณ์มือถือหรือแท็บเล็ตของผู้ใช้งาน:
1.  **กล้อง (Camera):** จำเป็นต้องมีเพื่อใช้ดึงภาพรอบตัวไปวิเคราะห์ (สิทธิเข้าถึงกล้องเป็นสิ่งสำคัญ)
2.  **ไมโครโฟน (Microphone):** จำเป็นสำหรับการสั่งการด้วยเสียงและคุยสายกับอาสาสมัคร
3.  **ลำโพง (Speaker):** จำเป็นอย่างยิ่งเพื่อรับฟังการตอบสนองจากระบบ (เสียงนำทางและ TTS)
4.  **มอเตอร์สั่น (Haptic Motor):** จำเป็นสำหรับการให้ Feedback ตอบสนองทางกายภาพ (Haptic Feedback) ให้ผู้พิการทางสายตารับรู้สถานะการทำงานต่างๆ

## 6. ข้อกำหนดในการพัฒนาและรันเซิร์ฟเวอร์ (Development Environment)
*   **Node.js:** จำเป็นต้องใช้ Node.js เวอร์ชันที่รองรับ Next.js 16+
*   **HTTPS:** ระบบจำเป็นต้องรันผ่าน HTTPS เสมอ (ในการพัฒนาใช้ `next dev --experimental-https` หรือผ่าน Cloudflared Tunnel) เนื่องจากเบราว์เซอร์ไม่อนุญาตให้ใช้กล้องและไมค์หากไม่ได้เชื่อมต่อผ่านโปรโตคอลที่ปลอดภัย (Secure Context)
