# 📷 QR Webcam Live

A simple QR-based webcam access project built with HTML, CSS, JavaScript, Node.js, Express and Socket.IO.

## 🚀 Features

* Generate a unique QR code
* Scan QR code using a mobile phone
* Open camera page from the QR code
* User must manually allow camera permission
* Live camera preview using browser camera APIs
* Unique room/session ID for each QR
* Socket.IO signaling server
* Responsive mobile-friendly camera page

## 📁 Project Structure

```text
qr-webcam-live/
├── .gitignore
├── vercel.json
├── README.md
├── public/
│   ├── dashboard.html
│   ├── camera.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── dashboard.js
│       └── camera.js
└── server/
    ├── server.js
    └── package.json
```

## 🛠️ Technologies

* HTML5
* CSS3
* JavaScript
* Express.js
* Socket.IO
* WebRTC
* QRCode.js

## 💻 Local Setup

### 1. Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd qr-webcam-live
```

### 2. Install backend dependencies

```bash
cd server
npm install
```

### 3. Start the backend

```bash
npm start
```

The Socket.IO server will run on:

```text
http://localhost:5000
```

### 4. Run the frontend

Open the `public` folder using a local web server.

For example, with VS Code Live Server:

```text
public/dashboard.html
```

## 📱 How It Works

1. Open `dashboard.html`.
2. A unique QR code is generated.
3. Scan the QR code with a mobile phone.
4. The phone opens `camera.html`.
5. The user presses **Allow Camera & Start**.
6. The browser asks for camera permission.
7. After permission is granted, the camera preview starts.

> Camera access always requires the user's permission. A QR code cannot silently activate a device camera.

## 🌐 Deployment

### Frontend

The `public/` folder can be deployed to Vercel.

Recommended Vercel settings:

```text
Framework Preset: Other
Root Directory: public
Build Command: blank
Output Directory: .
```

### Backend

The Express + Socket.IO server requires a Node.js host that supports a persistent server.

Examples include:

* Render
* Railway
* Other Node.js hosting services

After deploying the backend, update the Socket.IO URL inside:

```text
public/js/camera.js
```

For example:

```js
const socket = io('https://YOUR-BACKEND-URL');
```

Do not leave `http://localhost:5000` in production.

## ⚠️ HTTPS Requirement

Modern browsers generally require a secure context (`HTTPS`) for camera access when the page is hosted online.

For production, use:

```text
https://
```

instead of:

```text
http://
```

## 🔐 Privacy

This project is designed for consent-based camera access.

The QR code only opens the camera webpage. It does not automatically grant camera permission.

The user must explicitly allow camera access in the browser.

## 📄 License

This project is for learning and development purposes.
