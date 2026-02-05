# Nyeta: Real-time Visual Assistance System for the Visually Impaired with AI Integration

**Graduation Project** | **[University Name]**

---

## 📄 Abstract

**Nyeta** is a web-based comprehensive visual assistance platform designed to bridge the gap between visually impaired individuals and the sighted world. By integrating **Real-time WebRTC communication** with **Generative AI (Llama 3.2 Vision)**, the system provides two distinct modes of assistance: **Peer-to-Peer Human Assistance** and **AI-Powered Visual Interpretation**. This project aims to enhance the independence of blind users through accessible technology, utilizing a Progressive Web Application (PWA) architecture for cross-platform compatibility and ease of access.

---

## 🎯 Objectives

1.  **To develop a real-time assistance system** that connects blind users with sighted volunteers via low-latency video streaming.
2.  **To integrate Artificial Intelligence** capable of answering visual queries in Thai, acting as an always-available alternative to human volunteers.
3.  **To design an inclusive User Interface (UI)** that adheres to accessibility standards, utilizing voice commands, haptic feedback, and efficient screen reader support.
4.  **To implement a scalable architecture** using modern web technologies to ensure reliability and performance.

---

## 🏗 System Architecture

The system is built upon a **Client-Server architecture** utilizing Next.js for the frontend and serverless API routes, integrated with third-party services for real-time capabilities.

### 1. Frontend Layer
-   **Framework:** **Next.js 15+ (App Router)** offers Server-Side Rendering (SSR) for performance and SEO, coupled with Client-Side Rendering (CSR) for interactive components.
-   **UI/UX:** Designed with **Tailwind CSS v4** for responsiveness and high-contrast accessibility. Custom **Haptic Feedback** mechanisms provide tactile confirmation for user actions.
-   **State Management:** React Hooks (`useState`, `useRef`, `useCallback`) interact with effective local state management for media streams and connection statuses.

### 2. Communication Layer
-   **Signaling & Presence:** **Pusher** is utilized for WebSocket-based signaling, managing user presence (Online/Offline status), and event broadcasting (Call requests, cancellations, flashlight toggles).
-   **Media Streaming:** **PeerJS (WebRTC)** establishes peer-to-peer relationships for encrypted, low-latency video and audio transmission between the blind user and the volunteer.

### 3. Intelligence Layer
-   **AI Processing:** The system leverages the **Groq API** to access the **Llama 3.2 Vision** model.
    -   **Input:** Captured video frames (Base64 encoded) + User voice queries (transcribed via Web Speech API).
    -   **Output:** Context-aware descriptions and answers in natural Thai language.

---

## 🔑 Key Modules & Features

### 1. Blind User Interface (`/blind`)
Designed for "Eyes-Free" operation:
-   **One-Tap Calling:** simplified interaction to broadcast requests to available volunteers.
-   **AI Visual Assistant:** Users can "Ask the Scene" using voice commands. The system captures a frame, transcribes the question, and audibly speaks the AI's response.
-   **Accessibility Features:**
    -   **Wake Lock API:** Prevents the device from sleeping during active sessions.
    -   **Earcons:** Distinct audio cues for system states (Listening, Processing, Success, Error).
    -   **Vibration Patterns:** Tactile feedback for confirmed actions.

### 2. Volunteer Dashboard (`/volunteer`)
Designed for situational awareness and control:
-   **Status Management:** Toggle availability (Online/Offline) to receive calls.
-   **Live Video Feed:** Real-time view from the blind user's rear camera.
-   **Remote Device Control:**
    -   **Flashlight Toggle:** Volunteers can remotely activate the blind user's flashlight (Android support) to improve visibility in low-light environments.
    -   **Audio Control:** Ability to mute/unmute to minimize feedback loops.

---

## 🛠 Technology Stack

| Category | Technology | Usage |
| :--- | :--- | :--- |
| **Frontend Framework** | **Next.js 15** | Application logic & Routing |
| **Language** | **JavaScript (ES6+)** | Core Logic |
| **Styling** | **Tailwind CSS** | UI Design & Responsiveness |
| **Real-time Data** | **Pusher** | Signaling, Presence, Event Triggering |
| **P2P Streaming** | **PeerJS (WebRTC)** | Video/Audio Communication |
| **AI Model** | **Llama 3.2 Vision (via Groq)** | Image Recognition & Generative Text |
| **Browser APIs** | **Web Speech API** | Speech-to-Text (STT) |
| **Browser APIs** | **Vibration API** | Haptic Feedback |

---

## 🚀 Installation & Setup

### Prerequisites
-   **Node.js**: Version 18.17.0 or higher.
-   **npm** or **yarn**: Package manager.
-   **HTTPS Environment**: Required for accessing Camera and Microphone (e.g., localtunnel, ngrok, or production SSL).

### Local Deployment Steps

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/yourusername/nyeta.git
    cd nyeta
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Environment Configuration**
    Create a `.env.local` file in the root directory and populate the required keys:

    ```env
    # Pusher Configuration (Signaling)
    NEXT_PUBLIC_PUSHER_KEY=your_pusher_key
    NEXT_PUBLIC_PUSHER_CLUSTER=your_pusher_cluster
    PUSHER_APP_ID=your_app_id
    PUSHER_SECRET=your_secret

    # Groq API (AI Vision)
    NEXT_PUBLIC_GROQ_API_KEY=your_groq_api_key
    ```

4.  **Launch Development Server**
    ```bash
    npm run dev
    ```
    Access the application at `http://localhost:3000` (or your secure HTTPS URL).

---

## 👥 Contributors

-   **[Your Name]** - *Lead Developer*
-   **[Advisor Name]** - *Project Advisor*

**[Faculty Name]**  
**[University Name]**
