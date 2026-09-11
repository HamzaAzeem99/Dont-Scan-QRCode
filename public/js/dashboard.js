import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://mfenqufzpspzcgqgeqaw.supabase.co";
const SUPABASE_KEY = "sb_publishable_bfR2Kwu5k7tIQ7F6sEypLQ_cArfwl6q";

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const remoteVideo = document.getElementById("remoteVideo");
const status = document.getElementById("status");

const roomId =
    "room-" + Math.random().toString(36).substring(2, 10);

const cameraUrl =
    `${window.location.origin}/camera.html?room=${roomId}`;

console.log("Room:", roomId);
console.log("Camera URL:", cameraUrl);

// QR CODE
new QRCode(
    document.getElementById("qrcode"),
    {
        text: cameraUrl,
        width: 250,
        height: 250
    }
);

status.textContent = "Waiting for user...";

const peerConnection = new RTCPeerConnection({
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
});

// Receive mobile camera
peerConnection.ontrack = (event) => {

    console.log("📹 Mobile camera received");

    remoteVideo.srcObject = event.streams[0];

    remoteVideo.style.display = "block";

    status.textContent =
        "🟢 User camera connected";
};

// Dashboard ICE
peerConnection.onicecandidate = async (event) => {

    if (!event.candidate) return;

    await supabase
        .from("webrtc_signals")
        .insert({
            room_id: roomId,
            sender: "dashboard",
            type: "ice",
            payload: event.candidate.toJSON()
        });
};

// Supabase realtime
supabase
    .channel(`room-${roomId}`)
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

            if (signal.sender !== "camera") {
                return;
            }

            // OFFER
            if (signal.type === "offer") {

                console.log("📨 Offer received");

                await peerConnection.setRemoteDescription(
                    new RTCSessionDescription(signal.payload)
                );

                const answer =
                    await peerConnection.createAnswer();

                await peerConnection.setLocalDescription(
                    answer
                );

                await supabase
                    .from("webrtc_signals")
                    .insert({
                        room_id: roomId,
                        sender: "dashboard",
                        type: "answer",
                        payload: answer
                    });

                console.log("📤 Answer sent");
            }

            // CAMERA ICE
            if (signal.type === "ice") {

                try {

                    await peerConnection.addIceCandidate(
                        new RTCIceCandidate(signal.payload)
                    );

                    console.log("📡 Camera ICE received");

                } catch (error) {

                    console.error(
                        "ICE error:",
                        error
                    );

                }
            }
        }
    )
    .subscribe((state) => {

        console.log("Realtime:", state);

    });