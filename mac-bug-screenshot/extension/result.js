const statusEl = document.getElementById("status");
const closeTabBtn = document.getElementById("closeTabBtn");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b91c1c" : "#374151";
}

const params = new URLSearchParams(window.location.search);
const status = params.get("status") || "success";

if (status === "success") {
  setStatus("캡처 완료");
} else {
  setStatus(`오류: ${status}`, true);
}

closeTabBtn.addEventListener("click", () => {
  chrome.tabs.getCurrent((tab) => {
    if (tab?.id) {
      chrome.tabs.remove(tab.id);
    } else {
      window.close();
    }
  });
});
