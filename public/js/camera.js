const SUPABASE_URL = "https://mfenqufzpspzcgqgeqaw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bfR2Kwu5k7tIQ7F6sEypLQ_cArfwl6q";

// Using official Supabase CDN (window.supabase)
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");

const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
const localVideo = document.getElementById("localVideo");
const localVideoWrapper = document.getElementById("localVideoWrapper");
const streamInfo = document.getElementById("streamInfo");

function updateStatus(text, type = "waiting") {
  statusEl.textContent = text;
  statusEl.className = `status-badge ${type}`;
}

let localStream = null;
let peerConnection = null;
let pendingCandidates = [];
let isChannelSubscribed = false;

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

if (!roomId) {
  updateStatus("❌ Invalid or missing session room in URL.", "error");
  startBtn.disabled = true;
} else {
  console.log("Connected to room:", roomId);
}

// Supabase Realtime broadcast channel
const channel = roomId ? supabase.channel(`webrtc-room-${roomId}`) : null;

if (channel) {
  channel
    .on("broadcast", { event: "signal" }, async ({ payload }) => {
      if (!payload || payload.sender !== "dashboard") return;

      console.log("📩 Signal received from dashboard:", payload.type);

      try {
        // Dashboard ANSWER to camera's OFFER
        if (payload.type === "answer") {
          console.log("📦 Processing SDP answer from dashboard");
          if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.answer));
            updateStatus("🟢 Connected to dashboard", "connected");

            // Flush any buffered ICE candidates
            while (pendingCandidates.length > 0) {
              const cand = pendingCandidates.shift();
              await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
            }
          }
        }

        // Dashboard ICE Candidate
        if (payload.type === "ice") {
          if (!payload.candidate) return;

          if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
            console.log("✅ Dashboard ICE candidate added");
          } else {
            console.log("⏳ Queueing dashboard ICE candidate");
            pendingCandidates.push(payload.candidate);
          }
        }
      } catch (err) {
        console.error("Signaling error:", err);
      }
    })
    .subscribe((status) => {
      console.log("Supabase Realtime status:", status);
      if (status === "SUBSCRIBED") {
        isChannelSubscribed = true;
        // Announce camera joined
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

    // Request camera media stream
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }, // Prefer back camera on mobile
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    if (localVideo) {
      localVideo.srcObject = localStream;
      localVideoWrapper.style.display = "block";
      streamInfo.style.display = "block";
    }

    updateStatus("⚡ Initializing peer connection...", "waiting");

    if (peerConnection) {
      peerConnection.close();
    }
    pendingCandidates = [];

    peerConnection = new RTCPeerConnection(rtcConfig);

    // Add local tracks to RTCPeerConnection
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // Send ICE candidates to dashboard
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
      console.log("Camera WebRTC Connection State:", peerConnection.connectionState);
      if (peerConnection.connectionState === "connected") {
        updateStatus("🟢 Streaming live to dashboard", "connected");
      } else if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed") {
        updateStatus("⚠️ Connection interrupted", "error");
      }
    };

    // Create and send SDP Offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    console.log("📤 Sending SDP offer to dashboard");
    await channel.send({
      type: "broadcast",
      event: "signal",
      payload: {
        sender: "camera",
        type: "offer",
        offer: offer
      }
    });

    updateStatus("📡 Connecting to dashboard...", "waiting");
  } catch (error) {
    console.error("Camera access or WebRTC error:", error);
    updateStatus("❌ Camera error: " + (error.message || "Failed to start"), "error");
    startBtn.disabled = false;
  }
}

startBtn.addEventListener("click", () => {
  startBroadcasting();
});