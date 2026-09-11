const socket = io('https://qrcodescanner-bay.vercel.app/'); // Apne server ka URL yahan dein

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room') || 'default-room';

document.getElementById('session-info').innerText = `Session: #${roomId}`;

const localVideo = document.getElementById('localVideo');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

let localStream;
let peerConnection;

const iceServers = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

startBtn.addEventListener('click', async () => {
  try {
    // 1. Consent-based camera access
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';

    // 2. Join room as camera provider
    socket.emit('join-room', roomId, 'camera');

  } catch (error) {
    console.error('Camera permission denied or error:', error);
    alert('Camera access is required to stream.');
  }
});

// WebRTC Signaling listeners
socket.on('peer-joined', async ({ socketId, role }) => {
  if (role === 'dashboard') {
    console.log('Dashboard connected, creating WebRTC offer...');
    
    peerConnection = new RTCPeerConnection(iceServers);

    // Add local stream tracks to peer connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { roomId, candidate: event.candidate });
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('offer', { roomId, offer });
  }
});

socket.on('answer', async ({ answer }) => {
  if (peerConnection) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }
});

socket.on('ice-candidate', async ({ candidate }) => {
  if (peerConnection && candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

stopBtn.addEventListener('click', () => {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (peerConnection) {
    peerConnection.close();
  }
  window.location.reload();
});