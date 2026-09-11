// Dashboard portal page - generates quick session QR code
// Directs user to camera.html with room pointing to admin
const qrContainer = document.getElementById("qrcode");
const cameraUrlInput = document.getElementById("cameraUrlInput");
const copyBtn = document.getElementById("copyBtn");

const roomId = "room-" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
const baseUrl = window.location.href.replace(/dashboard\.html.*$/, "").replace(/\/$/, "");
const cameraUrl = `${baseUrl}/camera.html?room=${roomId}`;

console.log("Portal Session ID:", roomId);
console.log("Portal Camera URL:", cameraUrl);

if (cameraUrlInput) {
  cameraUrlInput.value = cameraUrl;
}

if (copyBtn) {
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
}

// Generate QR Code
if (qrContainer && typeof QRCode !== "undefined") {
  new QRCode(qrContainer, {
    text: cameraUrl,
    width: 200,
    height: 200,
    colorDark: "#0f172a",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
}
