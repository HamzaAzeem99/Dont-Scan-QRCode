import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://mfenqufzpspzcgqgeqaw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bfR2Kwu5k7tIQ7F6sEypLQ_cArfwl6q";


const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");

const startBtn = document.getElementById("startBtn");
const status = document.getElementById("status");

let localStream;
let peerConnection;

const iceServers = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
};

if (!roomId) {
  status.textContent = "Invalid camera session.";
  startBtn.disabled = true;
}

// Supabase realtime channel
const channel = supabase
  .channel(`camera-${roomId}`)
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "webrtc_signals",
      filter: `room_id=eq.${roomId}`
    },
    async (payload) => {

      const signal = payload.new;

      // Sirf dashboard ke messages
      if (signal.sender !== "dashboard") return;

      // Dashboard ANSWER
      if (signal.type === "answer") {

        console.log("📨 Dashboard answer received");

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(signal.payload)
        );

        status.textContent = "🟢 Connected to dashboard";
      }

      // Dashboard ICE candidate
      if (signal.type === "ice") {

        try {

          await peerConnection.addIceCandidate(
            new RTCIceCandidate(signal.payload)
          );

          console.log("📡 Dashboard ICE received");

        } catch (error) {

          console.error(
            "Failed to add dashboard ICE:",
            error
          );

        }
      }
    }
  )
  .subscribe((state) => {

    console.log("Realtime:", state);

  });

startBtn.addEventListener("click", async () => {

  try {

    startBtn.disabled = true;

    status.textContent =
      "Requesting camera permission...";

    // USER CAMERA
    localStream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });

    status.textContent =
      "Camera allowed. Connecting...";

    // WEBRTC
    peerConnection =
      new RTCPeerConnection(iceServers);

    // Camera tracks WebRTC mein add
    localStream
      .getTracks()
      .forEach((track) => {
        peerConnection.addTrack(
          track,
          localStream
        );
      });

    // Mobile ICE → Supabase → Dashboard
    peerConnection.onicecandidate =
      async (event) => {

        if (!event.candidate) return;

        await supabase
          .from("webrtc_signals")
          .insert({
            room_id: roomId,
            sender: "camera",
            type: "ice",
            payload: event.candidate.toJSON()
          });

      };

    // OFFER
    const offer =
      await peerConnection.createOffer();

    await peerConnection.setLocalDescription(
      offer
    );

    // Offer → Supabase
    const { error } =
      await supabase
        .from("webrtc_signals")
        .insert({
          room_id: roomId,
          sender: "camera",
          type: "offer",
          payload: offer
        });

    if (error) {
      throw error;
    }

    status.textContent =
      "📡 Camera connected. You can leave this page.";

    /*
      Optional:
      Mobile page ko automatically close nahi kar sakte
      because browsers security reasons ki wajah se
      arbitrary tabs ko close karne nahi dete.
    */

  } catch (error) {

    console.error(error);

    status.textContent =
      "❌ Camera connection failed.";

    startBtn.disabled = false;

  }

});