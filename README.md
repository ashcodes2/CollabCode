<div align="center">
  <h1>CollabCode</h1>
  <p><strong>Low-Latency Collaborative Code Editor with Distributed CRDT Synchronization</strong></p>

  <p>
    <a href="https://collabcode-ash.vercel.app"><img src="https://img.shields.io/badge/Live%20Demo-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" /></a>
    <a href="https://github.com/ashcodes2/CollabCode"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white" alt="Repository" /></a>
    <img src="https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node Version" />
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="License" />
  </p>
</div>

---

## ⚡ Overview

**CollabCode** is a distributed real-time collaborative IDE designed to support multi-user code editing with zero synchronization conflicts. Built on top of **Yjs (CRDT)** and **Socket.io**, the platform provides real-time character-by-character synchronization, remote cursor presence, admin-controlled permission gates, and isolated multi-language code execution.

---

## 🛠️ Key Architectural Highlights

* **Conflict-Free State Sync (Yjs CRDT):** Resolves concurrent mutations deterministically without centralized operational transforms (OT), ensuring immediate local rendering and eventual state convergence.
* **Low-Latency WebSockets:** Powered by Socket.io to stream binary state vector updates between active peers and relay room events.
* **Monaco Editor Integration:** Embedded VS Code editor experience with syntax highlighting, auto-complete, multi-cursor awareness, and shared file system navigation.
* **Sandboxed Code Execution:** Integrated execution pipeline supporting multiple programming runtimes via compiler endpoints with live stdout/stderr capture.
* **Access Control & Security:** Granular room permissions (Admin/Guest) allowing room hosts to toggle live write-access on the fly, backed by JWT-authenticated user sessions.

---

## 🏗️ System Architecture & Data Flow

```mermaid
graph TD
    subgraph ClientSpace ["Client Space (Multiple Peers)"]
        C1["Client 1 (React / Monaco)"] <-->|Y-Monaco Binding| Y1["Yjs CRDT Doc"]
        C2["Client 2 (React / Monaco)"] <-->|Y-Monaco Binding| Y2["Yjs CRDT Doc"]
        C1 -.->|Request Edit Permission| S["Express + Socket.io Server"]
        C2 -.->|Spatial Awareness| S
    end

    subgraph SyncLayer ["Real-Time Communication Layer"]
        Y1 <-->|sync-update| S
        Y2 <-->|sync-update| S
    end

    subgraph BackendServices ["Backend & External Services"]
        S <-->|Mongoose ODM| DB[("MongoDB Atlas")]
        S -->|Execute Code| JD["JDoodle Sandboxed API"]
    end

    style C1 fill:#1f6feb,stroke:#58a6ff,stroke-width:2px,color:#fff
    style C2 fill:#1f6feb,stroke:#58a6ff,stroke-width:2px,color:#fff
    style Y1 fill:#d29922,stroke:#f1e05a,stroke-width:2px,color:#fff
    style Y2 fill:#d29922,stroke:#f1e05a,stroke-width:2px,color:#fff
    style S fill:#238636,stroke:#2ea043,stroke-width:2px,color:#fff
    style DB fill:#8b949e,stroke:#c9d1d9,stroke-width:2px,color:#fff
    style JD fill:#fd7e14,stroke:#ff922b,stroke-width:2px,color:#fff
```

---

## 💻 Tech Stack

* **Frontend:** React.js, Vite, Monaco Editor, Tailwind CSS, Yjs, y-monaco
* **Backend:** Node.js, Express.js, Socket.io, JWT Authentication, bcrypt
* **Database:** MongoDB Atlas, Mongoose ODM
* **Execution & Infra:** JDoodle Sandboxed API, Vercel, Railway

---

## 📂 Repository Layout

```text
├── client/                     # Front-end React Application
│   ├── src/                    # Components, Monaco hooks, Socket providers
│   ├── public/                 # Static assets
│   ├── .env.example            # Client configuration keys
│   └── package.json
├── server/                     # Back-end Node/Express Server
│   ├── models/                 # Mongoose Schemas (User, Project, Room)
│   ├── routes/                 # Auth, Project persistence, Code execution APIs
│   ├── server.js               # Express & Socket.io server entry point
│   ├── .env.example            # Environment variables template
│   └── package.json
└── README.md
```

---

## 🚀 Local Development Setup

### 1. Clone Repository
```bash
git clone https://github.com/ashcodes2/CollabCode.git
cd CollabCode
```

### 2. Backend Setup
```bash
cd server
npm install
cp .env.example .env
npm run dev
```

### 3. Frontend Setup
```bash
cd ../client
npm install
cp .env.example .env
npm run dev
```

The application will run locally at `http://localhost:5173`.
