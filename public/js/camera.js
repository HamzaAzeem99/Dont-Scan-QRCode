const SUPABASE_URL = "https://mfenqufzpspzcgqgeqaw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bfR2Kwu5k7tIQ7F6sEypLQ_cArfwl6q";

// Using Supabase CDN (window.supabase)
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");

const startSection = document.getElementById("startSection");
const activeSection = document.getElementById("activeSection");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const localVideo = document.getElementById("localVideo");
const localVideoWrapper = document.getElementById("localVideoWrapper");

function updateStatus(text, type = "waiting") {
  statusEl.textContent = text;
  statusEl.className = `status-badge ${type}`;
}

let localStream = null;
let peerConnection = null;
let pendingCandidates = [];

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

if (!roomId) {
  updateStatus("❌ Invalid or missing session in QR link.", "error");
  startBtn.disabled = true;
} else {
  console.log("Joined session room:", roomId);
}

// Supabase Realtime channel
const channel = roomId ? supabase.channel(`webrtc-room-${roomId}`) : null;

if (channel) {
  channel
    .on("broadcast", { event: "signal" }, async ({ payload }) => {
      if (!payload || payload.sender !== "contact") return;

      console.log("📩 Signal received from admin screen:", payload.type);

      try {
        // Admin sends SDP Answer
        if (payload.type === "answer") {
          console.log("📦 Received Answer from admin, setting remote description");
          if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.answer));
            updateStatus("🟢 Connected to Admin! Streaming live.", "connected");
            startSection.style.display = "none";
            activeSection.style.display = "block";

            // Flush queued ICE candidates
            while (pendingCandidates.length > 0) {
              const cand = pendingCandidates.shift();
              await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
            }
          }
          return;
        }

        // Admin sends ICE candidate
        if (payload.type === "ice") {
          if (!payload.candidate) return;

          if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            pendingCandidates.push(payload.candidate);
          }
          return;
        }

        // Admin ended session
        if (payload.type === "end-session") {
          stopBroadcasting("Admin ended the session.");
        }
      } catch (err) {
        console.error("Signaling error on camera device:", err);
      }
    })
    .subscribe((status) => {
      console.log("Supabase Realtime status:", status);
      if (status === "SUBSCRIBED") {
        // Notify admin that user opened camera page
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { sender: "camera", type: "ready" }
        });
      }
    });
}

async function startBroadcasting() {
  try {
    startBtn.disabled = true;
    updateStatus("📷 Requesting camera permission...", "waiting");

    // Standard HTML5 getUserMedia - requires explicit user consent
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }, // Defaults to phone back camera
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    // Show local preview so user sees what is being sent
    if (localVideo) {
      localVideo.srcObject = localStream;
      localVideoWrapper.style.display = "block";
    }

    updateStatus("⚡ Connecting to admin...", "waiting");

    if (peerConnection) {
      peerConnection.close();
    }
    pendingCandidates = [];

    peerConnection = new RTCPeerConnection(rtcConfig);

    // Add camera tracks to WebRTC connection
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // Relay camera ICE candidates to admin via Supabase
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && channel) {
        console.log("📤 Sending ICE candidate from camera");
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: {
            sender: "camera",
            type: "ice",
            candidate: event.candidate.toJSON()
          }
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log("Camera WebRTC connection state:", peerConnection.connectionState);
      if (peerConnection.connectionState === "connected") {
        updateStatus("🟢 Connected to Admin! Streaming live.", "connected");
        startSection.style.display = "none";
        activeSection.style.display = "block";
      } else if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed") {
        updateStatus("⚠️ Connection to admin interrupted.", "error");
      }
    };

    // Generate SDP Offer and send to admin
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    console.log("📤 Sending SDP offer to admin");
    await channel.send({
      type: "broadcast",
      event: "signal",
      payload: {
        sender: "camera",
        type: "offer",
        offer: offer
      }
    });

    updateStatus("📡 Transmitting offer to admin...", "waiting");
  } catch (error) {
    console.error("Camera permission error:", error);
    let errMsg = "Camera access denied or unavailable.";
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      errMsg = "❌ Camera permission was denied in browser.";
    } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      errMsg = "❌ No camera found on this device.";
    } else if (error.name === "NotReadableError") {
      errMsg = "❌ Camera is already in use by another application.";
    }
    updateStatus(errMsg, "error");
    startBtn.disabled = false;
  }
}

function stopBroadcasting(message = "Camera stopped.") {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (channel) {
    channel.send({
      type: "broadcast",
      event: "signal",
      payload: { sender: "camera", type: "disconnected" }
    });
  }
  if (localVideo) {
    localVideo.srcObject = null;
    localVideoWrapper.style.display = "none";
  }
  activeSection.style.display = "none";
  startSection.style.display = "block";
  startBtn.disabled = false;
  updateStatus(message, "waiting");
}

startBtn.addEventListener("click", () => {
  startBroadcasting();
});

stopBtn.addEventListener("click", () => {
  stopBroadcasting("You stopped camera sharing.");
});

// Clean up when user navigates away or closes tab
window.addEventListener("beforeunload", () => {
  stopBroadcasting();
});
