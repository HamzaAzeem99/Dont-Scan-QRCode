const roomId =
  'room-' + Math.random().toString(36).substring(2, 9);

const mobileUrl =
  `${window.location.origin}/camera.html?room=${roomId}`;

new QRCode(document.getElementById("qrcode"), {
  text: mobileUrl,
  width: 250,
  height: 250
});

console.log("Room:", roomId);
console.log("Camera URL:", mobileUrl);