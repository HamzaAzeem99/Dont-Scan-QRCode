// Contact.html - Admin Monitor Page
// Displays connected user's live camera feed via WebRTC
// Supabase is used strictly for WebRTC signaling and session status

const SUPABASE_URL = "https://mfenqufzpspzcgqgeqaw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bfR2Kwu5k7tIQ7F6sEypLQ_cArfwl6q";

const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM Elements
const statusBadge = document.getElementById("status");
const sessionIdDisplay = document.getElementById("sessionIdDisplay");
const connectionStateDisplay = document.getElementById("connectionStateDisplay");
const qrSection = document.getElementById("qr-section");
const qrContainer = document.getElementById("qrcode");
const cameraUrlInput = document.getElementById("cameraUrlInput");
const copyBtn = document.getElementById("copyBtn");
const videoSection = document.getElementById("video-section");
const remoteVideo = document.getElementById("remoteVideo");
const disconnectBtn = document.getElementById("disconnectBtn");
const newSessionBtn = document.getElementById("newSessionBtn");

function updateStatus(text, badgeType = "waiting", connState = null) {
  statusBadge.textContent = text;
  statusBadge.className = `status-badge ${badgeType}`;
  if (connState) {
    connectionStateDisplay.textContent = connState;
    if (connState === "Connected") {
      connectionStateDisplay.style.color = "#4ade80";
    } else if (connState === "Disconnected" || connState === "Failed") {
      connectionStateDisplay.style.color = "#f87171";
    } else {
      connectionStateDisplay.style.color = "#cbd5e1";
    }
  }
}

// Generate unique session / room ID
const sessionId = "sess_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
sessionIdDisplay.textContent = sessionId;

// Build camera.html URL for user's phone
const baseUrl = window.location.href.replace(/contact\.html.*$/, "").replace(/\/$/, "");
const cameraUrl = `${baseUrl}/camera.html?room=${sessionId}`;

cameraUrlInput.value = cameraUrl;

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(cameraUrl);
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy Link"; }, 2000);
  } catch (err) {
    cameraUrlInput.select();
    document.execCommand("copy");
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy Link"; }, 2000);
  }
});

// Generate QR Code for camera.html
if (typeof QRCode !== "undefined") {
  new QRCode(qrContainer, {
    text: cameraUrl,
    width: 220,
    height: 220,
    colorDark: "#0f172a",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
} else {
  console.error("QRCode library is not loaded.");
}

// WebRTC Configuration with public STUN servers
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

let peerConnection = null;
let pendingCandidates = [];
let realtimeChannel = null;

// Initialize camera_sessions table entry
async function initSession() {
  try {
    await supabase.from("camera_sessions").insert({
      id: sessionId,
      status: "waiting"
    });
  } catch (err) {
    console.warn("Could not insert camera_sessions record:", err);
  }
}
initSession();

// Setup Supabase Realtime Broadcast channel for WebRTC signaling
realtimeChannel = supabase.channel(`webrtc-room-${sessionId}`);

function createPeerConnection() {
  if (peerConnection) {
    peerConnection.close();
  }
  pendingCandidates = [];

  peerConnection = new RTCPeerConnection(rtcConfig);

  // Admin receives user's camera feed
  peerConnection.ontrack = (event) => {
    console.log("📹 Remote user camera stream received:", event.streams);
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      videoSection.style.display = "block";
      qrSection.style.display = "none";
      updateStatus("🟢 User camera feed live", "connected", "Connected");
    }
  };

  // Send admin ICE candidates to user's phone via Supabase Realtime
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && realtimeChannel) {
      realtimeChannel.send({
        type: "broadcast",
        event: "signal",
        payload: {
          sender: "contact",
          type: "ice",
          candidate: event.candidate.toJSON()
        }
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    console.log("Admin WebRTC Connection State:", state);
    if (state === "connected") {
      updateStatus("🟢 User connected - Streaming Live", "connected", "Connected");
    } else if (state === "disconnected" || state === "failed" || state === "closed") {
      handleUserDisconnected("User camera stream ended");
    }
  };

  return peerConnection;
}

function handleUserDisconnected(reason = "User disconnected") {
  updateStatus(`⚠️ ${reason}`, "error", "Disconnected");
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(t => t.stop());
    remoteVideo.srcObject = null;
  }
  videoSection.style.display = "none";
  qrSection.style.display = "block";
  newSessionBtn.style.display = "inline-flex";

  // Update session status in Supabase
  supabase.from("camera_sessions").update({ status: "disconnected" }).eq("id", sessionId).catch(() => {});
}

// Listen for signaling messages from user's camera.html
realtimeChannel
  .on("broadcast", { event: "signal" }, async ({ payload }) => {
    if (!payload || payload.sender !== "camera") return;

    console.log("📩 Signal received from camera device:", payload.type);

    try {
      // 1. User's phone announces it opened the camera page
      if (payload.type === "ready") {
        updateStatus("📲 User opened camera page. Waiting for permission...", "waiting", "User Present");
        return;
      }

      // 2. User granted permission and sent WebRTC SDP Offer
      if (payload.type === "offer") {
        console.log("📦 Processing SDP Offer from user's phone");
        updateStatus("⚡ Establishing peer connection...", "waiting", "Connecting...");

        const pc = createPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));

        // Flush queued ICE candidates
        while (pendingCandidates.length > 0) {
          const cand = pendingCandidates.shift();
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }

        // Generate SDP Answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        console.log("📤 Sending SDP Answer to user's phone");
        await realtimeChannel.send({
          type: "broadcast",
          event: "signal",
          payload: {
            sender: "contact",
            type: "answer",
            answer: answer
          }
        });

        // Update session status in Supabase
        await supabase.from("camera_sessions").update({ status: "connected" }).eq("id", sessionId);
        return;
      }

      // 3. User's phone sends ICE candidate
      if (payload.type === "ice") {
        if (!payload.candidate) return;

        if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } else {
          pendingCandidates.push(payload.candidate);
        }
        return;
      }

      // 4. User explicitly stopped camera or closed tab
      if (payload.type === "disconnected") {
        handleUserDisconnected("User stopped camera");
      }
    } catch (err) {
      console.error("Signaling error:", err);
      updateStatus("❌ Signaling error: " + err.message, "error", "Error");
    }
  })
  .subscribe((status) => {
    console.log("Supabase Realtime Channel Status:", status);
    if (status === "SUBSCRIBED") {
      updateStatus("📱 Waiting for user to scan QR code...", "waiting", "Waiting for User");
    }
  });

// Admin manual disconnect button
disconnectBtn.addEventListener("click", () => {
  if (realtimeChannel) {
    realtimeChannel.send({
      type: "broadcast",
      event: "signal",
      payload: { sender: "contact", type: "end-session" }
    });
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  handleUserDisconnected("Admin closed the session");
});

// Generate new session button
newSessionBtn.addEventListener("click", () => {
  window.location.reload();
});

// Clean up when admin navigates away
window.addEventListener("beforeunload", () => {
  supabase.from("camera_sessions").delete().eq("id", sessionId).catch(() => {});
  supabase.from("webrtc_signals").delete().eq("room_id", sessionId).catch(() => {});
});
