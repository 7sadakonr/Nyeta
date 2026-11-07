# คู่มือการ Deploy ระบบ Nyeta และการเชื่อมต่อ Google Gemini API

เอกสารนี้อธิบายขั้นตอนนำระบบ Nyeta ขึ้นใช้งานจริงบน Vercel ตั้งแต่การเตรียมบริการภายนอกทั้งหมด การตั้งค่าตัวแปรสภาพแวดล้อม การเชื่อมต่อ Google Gemini API ไปจนถึงการตรวจสอบหลัง deploy เขียนจากซอร์สโค้ดใน repo นี้ (ข้อมูล ณ commit `cb13599`)

- ระบบที่ใช้งานจริง: https://nyeta.vercel.app
- หน้าอาสาสมัคร: https://nyeta.vercel.app/volunteer
- ภาพรวมสถาปัตยกรรมและโครงสร้างโฟลเดอร์: ดู [README.md](../README.md)

---

## 1. ภาพรวมบริการที่ระบบใช้

ระบบ Nyeta ทำงานแบบ serverless บน Vercel ทั้งหมด (ไม่มีเซิร์ฟเวอร์แยก) และต้องมีบริการภายนอกดังนี้

| บริการ | หน้าที่ในระบบ | จำเป็นหรือไม่ |
|---|---|---|
| **Vercel** | โฮสต์เว็บแอป Next.js และ API route | จำเป็น |
| **Google Gemini API** | บรรยายภาพ ตรวจธนบัตรและเหรียญ อ่านเอกสาร (`/api/gemini`) | จำเป็น |
| **Pusher Channels** | ส่งสัญญาณ (presence, สายเรียกเข้า, SDP/ICE) ระหว่างผู้ใช้กับอาสาสมัคร | จำเป็น |
| **Upstash Redis** | เก็บสถานะคำร้องขอความช่วยเหลือ และนับอัตราการเรียกใช้ (rate limit) | จำเป็นสำหรับ production |
| **TURN server** | รีเลย์วิดีโอ/เสียง เมื่อเชื่อมต่อโดยตรงไม่ได้ (เครือข่ายมือถือ/ไฟร์วอลล์) | แนะนำ (ไม่บังคับ) |
| **STUN ของ Google** | ช่วยค้นหาที่อยู่เครือข่ายสำหรับ WebRTC | ใช้ฟรีอยู่แล้วในโค้ด ไม่ต้องตั้งค่า |

## 2. สิ่งที่ต้องเตรียม

- บัญชี GitHub, Vercel, Google, Pusher และ Upstash
- Node.js 22 ขึ้นไป (CI ของโครงการใช้ 22.22.2 ขั้นต่ำที่ README ระบุคือ 20)
- Git และ npm

## 3. ดึงซอร์สโค้ด

```bash
git clone https://github.com/7sadakonr/nyeta
cd nyeta
npm ci
```

ถ้าต้องการ deploy ของตัวเอง ให้ Fork repo นี้ไปที่บัญชี GitHub ของคุณก่อน แล้วใช้ repo ที่ Fork เป็นต้นทางในขั้นตอนที่ 7

## 4. เชื่อมต่อ Google Gemini API

โค้ดเรียก Gemini ผ่าน `src/server/ai/geminiClient.ts` เฉพาะฝั่งเซิร์ฟเวอร์ (`/api/gemini`) ฝั่งเบราว์เซอร์ไม่เคยถือ API key และส่งเพียงชื่อโหมด (`assistant`, `currency`, `reader`) ให้เซิร์ฟเวอร์เลือก prompt เอง

### 4.1 สร้าง API key

1. เปิด Google AI Studio หน้า API keys: https://aistudio.google.com/apikey
2. ล็อกอินด้วยบัญชี Google แล้วกด **Create API key** เลือกโปรเจกต์ Google Cloud ที่ต้องการ (ถ้ามีโปรเจกต์เดิม ให้ Import projects ก่อน)
3. คัดลอกคีย์เก็บไว้ อย่าส่งต่อหรือ commit ลง Git
4. หากปุ่มสร้างคีย์ใช้ไม่ได้ ให้ขอสิทธิ์ผู้ดูแลโปรเจกต์ หรือสร้างโปรเจกต์ Google Cloud ใหม่ที่ไม่ผูกกับองค์กร
5. คีย์ที่สร้างตั้งแต่ 28 พฤษภาคม 2026 เป็นต้นไป เอกสารของ Google ระบุว่าคีย์มาตรฐานที่ไม่จำกัดสิทธิ์จะถูกปฏิเสธ ให้จำกัดคีย์ให้ใช้ได้เฉพาะ Gemini API (ดูรายละเอียดที่ https://ai.google.dev/gemini-api/docs/api-key)

### 4.2 ตั้งค่าในระบบ

| ตัวแปร | ค่า | หมายเหตุ |
|---|---|---|
| `GEMINI_API_KEY` | คีย์ที่ได้ในข้อ 4.1 | จำเป็น หากไม่ตั้ง `/api/gemini` จะตอบ HTTP 500 ว่า "Gemini API Key is not configured on the server." |
| `GEMINI_MODEL` | ชื่อโมเดล เช่น `gemini-3.5-flash` | ไม่บังคับ ค่าเริ่มต้นในโค้ดคือ `gemini-3.5-flash` |

ข้อควรรู้ที่มาจากโค้ด

- ค่าเริ่มต้น `gemini-3.5-flash` ถูกเลือกเพราะ `gemini-3.1-flash-lite` เคยตอบ HTTP 503 (มีผู้ใช้งานหนาแน่น) ทุกครั้งที่ทดสอบ หากต้องการเปลี่ยนโมเดลให้ตั้ง `GEMINI_MODEL` โดยไม่ต้องแก้โค้ด
- ระบบเรียก `https://generativelanguage.googleapis.com/v1beta/models/<โมเดล>:generateContent` โดยส่งคีย์ในส่วนหัว `x-goog-api-key`
- ข้อผิดพลาด 500, 502, 503, 504 และการหมดเวลาจะถูกลองใหม่อัตโนมัติ (ครั้งละไม่เกิน 25 วินาที รวมไม่เกิน 54 วินาที) โหมด `currency` ลองใหม่ 1 ครั้ง โหมดอื่นลองใหม่ได้ 2 ครั้ง
- จำกัดการเรียกต่อ IP ต่อ 60 วินาที: `gemini` 20 ครั้ง, `gemini_currency` 40 ครั้ง (เกินจะได้ HTTP 429 พร้อมหัว `Retry-After`)
- โมเดลตระกูล 3.5 ขึ้นไป โค้ดตั้ง `thinkingLevel: minimal` ให้อัตโนมัติ เพื่อไม่ให้งบ token ถูกใช้กับการคิดภายในจนคำตอบสั้นถูกตัด

### 4.3 ทดสอบคีย์ก่อนนำไปใช้

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"สวัสดี"}]}]}'
```

ถ้าได้ JSON กลับมามีข้อความตอบ แสดงว่าคีย์ใช้ได้ หากได้ 400/403 ให้ตรวจว่าคีย์ถูกต้องและไม่ถูกจำกัดสิทธิ์ผิดบริการ

### 4.4 ถ้าคีย์รั่วไหล

สร้างคีย์ใหม่ เปลี่ยนค่าใน Vercel แล้ว deploy ใหม่ จากนั้นยืนยันว่าระบบใช้งานได้ก่อนปิดคีย์เก่า และตรวจประวัติการใช้งานใน Google Cloud Console

## 5. เตรียมบริการอื่น

### 5.1 Pusher Channels (สัญญาณเรียลไทม์)

1. สมัครที่ https://dashboard.pusher.com แล้วสร้างแอปใหม่ในผลิตภัณฑ์ **Channels**
2. เลือก cluster ใกล้ผู้ใช้ (ค่าเริ่มต้นในโค้ดคือ `ap1`)
3. เปิดแท็บ **App Keys** แล้วคัดลอก `app_id`, `key`, `secret`, `cluster`
4. ไม่ต้องเปิด Client Events เพราะเหตุการณ์ทั้งหมด (`incoming-call`, `offer`, `answer` ฯลฯ) ถูกส่งจากเซิร์ฟเวอร์ผ่าน `/api/pusher/trigger`

| ตัวแปร | ค่า |
|---|---|
| `PUSHER_APP_ID` | app_id |
| `NEXT_PUBLIC_PUSHER_KEY` | key |
| `PUSHER_SECRET` | secret (ห้ามเปิดเผย) |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | cluster เช่น `ap1` |

ตัวแปรที่ขึ้นต้น `NEXT_PUBLIC_` ถูกฝังในโค้ดฝั่งเบราว์เซอร์ตอน build ถ้าเปลี่ยนค่า ต้อง Redeploy ใหม่ (ไม่ใช่แค่รีสตาร์ต)

### 5.2 Upstash Redis (สถานะสายและ rate limit)

1. สมัครที่ https://console.upstash.com แล้วสร้างฐานข้อมูล Redis เลือก region ใกล้ผู้ใช้
2. เปิดหน้าฐานข้อมูล ส่วน REST API แล้วคัดลอก URL และ Token

| ตัวแปร | ค่า |
|---|---|
| `UPSTASH_REDIS_REST_URL` | REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | REST Token |

ถ้าไม่ตั้งค่าสองตัวนี้ โค้ดจะสลับไปใช้หน่วยความจำในโปรเซส (in-memory) ซึ่งเหมาะกับพัฒนาในเครื่องเท่านั้น บน Vercel ซึ่งรันแบบ serverless หลายอินสแตนซ์ หน่วยความจำไม่ถูกแชร์กัน จึงไม่ควรใช้ใน production การรับสายแบบ atomic (อาสาสมัครสองคนรับสายเดียวกันไม่ได้) ก็อาศัย Redis

### 5.3 Session secret

```bash
openssl rand -hex 32
```

นำค่าที่ได้ไปตั้งเป็น `SESSION_SECRET` ใช้เซ็น token ของ session (HMAC-SHA256) ถ้าไม่ตั้ง โค้ดจะใช้ `PUSHER_SECRET` แทน และใน production หากไม่มีทั้งสองค่า ระบบจะ throw ข้อผิดพลาด "CRITICAL: SESSION_SECRET or PUSHER_SECRET must be set in production" แนะนำให้ตั้ง `SESSION_SECRET` แยกต่างหาก

### 5.4 TURN server (ไม่บังคับแต่แนะนำ)

ใช้เมื่อการเชื่อมต่อวิดีโอโดยตรงไม่ได้ เช่น บนเครือข่ายมือถือ โค้ดมี STUN ของ Google ให้อยู่แล้ว หากต้องการ TURN ให้สมัครผู้ให้บริการ TURN (ตัวอย่างใน README ใช้ Metered) แล้วตั้งค่า

| ตัวแปร | ตัวอย่าง |
|---|---|
| `TURN_URL` | `turn:global.relay.metered.ca:443?transport=tcp` |
| `TURN_USERNAME` | ชื่อผู้ใช้จากผู้ให้บริการ |
| `TURN_CREDENTIAL` | รหัสจากผู้ให้บริการ |

เซิร์ฟเวอร์ส่งค่าเหล่านี้ให้เบราว์เซอร์ผ่าน `/api/webrtc/ice` พร้อมหัว `Cache-Control: private, no-store` โค้ดยังรองรับชื่อ `NEXT_PUBLIC_TURN_*` แต่ไม่แนะนำ เพราะค่าจะถูกฝังในโค้ดฝั่งเบราว์เซอร์ ถ้าไม่ตั้ง TURN เลย ใน production ระบบจะใช้ STUN อย่างเดียว (โหมดพัฒนาจะใช้ TURN สาธารณะสำรองของ openrelay)

## 6. ตัวแปรสภาพแวดล้อมทั้งหมด

`.env*` ถูกเพิ่มใน `.gitignore` จึงไม่มีไฟล์ตัวอย่างใน repo ให้สร้างไฟล์ `.env.local` เองตามนี้ (อย่า commit)

```env
# Google Gemini (ฝั่งเซิร์ฟเวอร์เท่านั้น)
GEMINI_API_KEY=ใส่คีย์ของคุณ
GEMINI_MODEL=gemini-3.5-flash

# Pusher Channels
PUSHER_APP_ID=ใส่ app_id
NEXT_PUBLIC_PUSHER_KEY=ใส่ key
PUSHER_SECRET=ใส่ secret
NEXT_PUBLIC_PUSHER_CLUSTER=ap1

# ความปลอดภัยของ session
SESSION_SECRET=ผลลัพธ์จาก openssl rand -hex 32

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=ใส่โทเคน

# TURN (ไม่บังคับ)
TURN_URL=turn:global.relay.metered.ca:443?transport=tcp
TURN_USERNAME=ใส่ชื่อผู้ใช้
TURN_CREDENTIAL=ใส่รหัส
```

| ตัวแปร | จำเป็น | ใช้ที่ไหน |
|---|---|---|
| `GEMINI_API_KEY` | ต้องมี | `src/server/ai/geminiClient.ts` |
| `GEMINI_MODEL` | ไม่บังคับ | เปลี่ยนโมเดล Gemini |
| `PUSHER_APP_ID`, `PUSHER_SECRET` | ต้องมี | `src/server/realtime/pusherServer.ts` |
| `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER` | ต้องมี | ทั้งเซิร์ฟเวอร์และเบราว์เซอร์ |
| `PUSHER_KEY`, `PUSHER_CLUSTER` | ไม่บังคับ | ค่าฝั่งเซิร์ฟเวอร์ที่ใช้แทนสองตัวบนได้ |
| `SESSION_SECRET` | แนะนำอย่างยิ่ง | `src/server/auth/sessionAuth.ts` (สำรองด้วย `PUSHER_SECRET`) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | ต้องมีใน production | สถานะสายและ rate limit |
| `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | ไม่บังคับ | `src/server/webrtc/iceConfig.ts` |

## 7. รันในเครื่องเพื่อพัฒนา

```bash
npm run dev        # เซิร์ฟเวอร์ HTTPS (กล้องและไมโครโฟนบนเบราว์เซอร์ต้องใช้ HTTPS)
npm run dev:http   # โหมด HTTP สำหรับทดสอบทั่วไป
npm run tunnel     # เปิดอุโมงค์ cloudflared ให้มือถือเข้าได้ (ต้องติดตั้ง cloudflared)
```

หากทดสอบจากมือถือผ่านเครือข่ายภายใน (LAN) ให้เพิ่มที่อยู่ IP ของคอมพิวเตอร์ลงในรายการ `allowedDevOrigins` ของไฟล์ `next.config.mjs` (ปัจจุบันมีเฉพาะ IP ของผู้พัฒนา)

ตรวจคุณภาพก่อนนำขึ้น

```bash
npm run typecheck
npm run lint
npm run test       # unit test (Vitest)
npm run test:e2e   # end-to-end (Playwright)
```

## 8. Deploy ขึ้น Vercel

1. นำโค้ดขึ้น GitHub (repo ของคุณ)
2. เข้า https://vercel.com แล้วเลือก **Add New → Project** เลือก repo นี้ Vercel จะตรวจพบ Next.js อัตโนมัติ ไม่ต้องแก้คำสั่ง build
3. ที่หน้าตั้งค่าโปรเจกต์ เปิดส่วน **Environment Variables** แล้วเพิ่มตัวแปรทั้งหมดจากหัวข้อ 6 (เลือก Production และ Preview ตามต้องการ)
4. ถ้าใช้ Upstash ผ่าน Vercel Marketplace (Integrations) ให้ตรวจว่าชื่อตัวแปรที่ถูกเพิ่มอัตโนมัติตรงกับ `UPSTASH_REDIS_REST_URL` และ `UPSTASH_REDIS_REST_TOKEN` ถ้าไม่ตรง ให้เพิ่มตัวแปรสองชื่อนี้เองด้วยค่าเดียวกัน
5. กด **Deploy** รอ build เสร็จ จะได้ที่อยู่รูปแบบ `https://<ชื่อโปรเจกต์>.vercel.app`
6. ถ้าแก้ตัวแปรสภาพแวดล้อมภายหลัง ให้ Redeploy ทุกครั้ง โดยเฉพาะตัวแปร `NEXT_PUBLIC_*`

ทางเลือก: ใช้ Vercel CLI

```bash
npm i -g vercel
vercel link          # ผูกโฟลเดอร์กับโปรเจกต์
vercel env add GEMINI_API_KEY production   # ทำซ้ำสำหรับแต่ละตัวแปร
vercel --prod        # deploy
```

หมายเหตุ: route `/api/gemini` ตั้ง `maxDuration = 60` วินาที ควรตรวจสอบข้อจำกัดระยะเวลาของ Function ตามแผน Vercel ที่ใช้

## 9. ตรวจสอบหลัง Deploy

1. เปิดเว็บบนมือถือ (ต้องเป็น HTTPS) อนุญาตกล้องและไมโครโฟน
2. โหมด **AI**: กด "บรรยายสิ่งที่เห็น" ควรได้คำบรรยาย (ทดสอบการเชื่อม Gemini)
3. โหมด **เงิน** และโหมด **อ่าน**: ทดสอบด้วยธนบัตรและเอกสารจริง
4. เปิด `/volunteer` บนอีกอุปกรณ์ กด "เปิดรับสาย (ออนไลน์)" แล้วกด "เรียกอาสาสมัคร" จากเครื่องแรก ควรมีสายเรียกเข้าและเห็นภาพสด
5. เปิด Debug Console ของแอปใน Pusher Dashboard ควรเห็นเหตุการณ์ `incoming-call`, `offer`, `answer`
6. เปิด Data Browser ของ Upstash ควรเห็นคีย์ขึ้นต้น `nyeta:call:` ระหว่างมีสาย (หมดอายุเองใน 10 นาที)
7. ติดตั้ง PWA: Android กด "ติดตั้ง Nyeta" / iPhone ใช้ Share → Add to Home Screen

## 10. แก้ปัญหาที่พบบ่อย

| อาการ / ข้อความ | สาเหตุที่เป็นไปได้ | วิธีแก้ |
|---|---|---|
| `Gemini API Key is not configured on the server.` (HTTP 500) | ไม่ได้ตั้ง `GEMINI_API_KEY` หรือยังไม่ได้ Redeploy | ตั้งค่าใน Vercel แล้ว Redeploy |
| HTTP 429 จาก `/api/gemini` | เรียกเกินจำกัดต่อ IP | รอตามค่า `Retry-After` แล้วลองใหม่ |
| HTTP 503 / 504 จาก Gemini | โมเดลคนใช้หนาแน่นหรือหมดเวลา | ระบบลองใหม่เอง หากเกิดบ่อยให้ตั้ง `GEMINI_MODEL` เป็นโมเดลอื่น |
| HTTP 400/403 จาก Google | คีย์ผิด หมดอายุ หรือจำกัดสิทธิ์ไม่ตรง | สร้างหรือแก้คีย์ใน AI Studio แล้วทดสอบตามหัวข้อ 4.3 |
| `CRITICAL: SESSION_SECRET or PUSHER_SECRET must be set in production` | ไม่ได้ตั้ง secret | ตั้ง `SESSION_SECRET` |
| `Pusher key/cluster missing. Check NEXT_PUBLIC_PUSHER_* env vars.` | ไม่ได้ตั้งหรือตั้งผิดชื่อ | ตั้ง `NEXT_PUBLIC_PUSHER_KEY` และ `NEXT_PUBLIC_PUSHER_CLUSTER` แล้ว Redeploy |
| อาสาสมัครไม่ได้รับสายเรียก | cluster หรือ key ไม่ตรงกับแอปใน Pusher | ตรวจค่า Pusher ให้ตรงกันทั้งสองฝั่ง |
| สายหลุดหรือไม่มีภาพบนเครือข่ายมือถือ | เชื่อมต่อตรงไม่ได้ ไม่มี TURN | ตั้งค่า `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` |
| กล้องหรือไมโครโฟนใช้ไม่ได้ | ไม่ใช่ HTTPS หรือไม่ได้อนุญาต | ใช้ HTTPS หรืออนุญาตสิทธิ์ในการตั้งค่าเบราว์เซอร์ |
| สายค้นหาอาสาสมัครไม่เจอเป็นระยะ | ไม่ได้ตั้ง Upstash Redis จึงใช้หน่วยความจำของแต่ละอินสแตนซ์ | ตั้ง `UPSTASH_REDIS_REST_URL` และ `UPSTASH_REDIS_REST_TOKEN` |

## 11. ความปลอดภัย

- ห้าม commit ไฟล์ `.env*` และห้ามเผยแพร่ `GEMINI_API_KEY`, `PUSHER_SECRET`, `SESSION_SECRET`, `UPSTASH_REDIS_REST_TOKEN`, `TURN_CREDENTIAL`
- คีย์ Gemini อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ตัวแปรที่ขึ้นต้น `NEXT_PUBLIC_` ถูกเปิดเผยต่อเบราว์เซอร์ จึงใช้กับ key ของ Pusher (ซึ่งเป็นค่าสาธารณะ) เท่านั้น
- ตั้งการแจ้งเตือนค่าใช้จ่ายใน Google Cloud Console เพื่อจับการใช้งานผิดปกติ
