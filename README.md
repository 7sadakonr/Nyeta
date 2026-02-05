# Nyeta - Blind Assistance Application

**Nyeta** is a progressive web application (PWA) designed to empower visually impaired individuals by connecting them with sighted volunteers or AI tools for real-time visual assistance.

## 🌟 Key Features

### For Blind Users
- **Start Call:** Instantly connect with available sighted volunteers via video call.
- **AI Visual Assistant (Be My AI):** 
  - Capture images and ask questions using voice commands.
  - Powered by **Llama 3.2 Vision** (via Groq API) for fast and accurate image descriptions in Thai.
  - Haptic feedback and sound cues (Earcons) for non-visual navigation.
- **Accessibility First:** High-contrast UI, screen reader compatibility, and vibration feedback.
- **Voice Input:** Use speech recognition to interact with the AI assistant.

### For Volunteers
- **Volunteer Dashboard:** Simple toggle to go Online/Offline.
- **Real-time Notifications:** Receive incoming calls instantly when online.
- **Assistance Tools:** 
  - View live video stream from the blind user's camera.
  - **Flashlight Control:** Remotely toggle the blind user's flashlight (Android support) to improve lighting.
  - **Mute/Unmute** microphone.

## 🛠 Tech Stack

- **Framework:** [Next.js 15+ (App Router)](https://nextjs.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Real-time Communication:** 
  - **WebRTC (PeerJS):** For peer-to-peer video and audio streaming.
  - **Pusher:** For real-time signaling, presence, and notifications.
- **AI Integration:** [Groq API](https://groq.com/) (Llama 3.2 Vision Model).

## 🚀 Getting Started

### Prerequisites

- Node.js 18.17 or later
- HTTPS environment (Required for Camera/Microphone access)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/nyeta.git
   cd nyeta
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env.local` file in the root directory and add the following keys:

   ```env
   # Pusher Configuration (Real-time Signaling)
   NEXT_PUBLIC_PUSHER_KEY=your_pusher_key
   NEXT_PUBLIC_PUSHER_CLUSTER=your_pusher_cluster
   
   # Groq API (For AI Vision)
   NEXT_PUBLIC_GROQ_API_KEY=your_groq_api_key
   ```

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   > **Note:** To test on mobile devices, you must access the app via **HTTPS**. Use tools like `ngrok` or `localtunnel` to expose your localhost via HTTPS.

### Usage

1. Open the app on two devices.
2. **Device 1 (Volunteer):** Select "Volunteer" -> Toggle "Start Volunteering" to go online.
3. **Device 2 (Blind User):** Select "I Need Help" -> The app will automatically search for available volunteers or allow you to use the AI Assistant.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
