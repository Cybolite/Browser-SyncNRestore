const statusDiv = document.getElementById("status");
document.getElementById("saveTabs").addEventListener("click", () => {
  // ask for the name of the file
  const name = prompt("Enter the name of the file");
  if (!name) return;
  chrome.runtime.sendMessage({ action: "saveTabs", name: name });
});

document.getElementById("restoreTabs").addEventListener("click", () => {
  const restoreInput = document.getElementById("restoreInput");
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json";
  file.click();
  file.addEventListener("change", () => {
    const reader = new FileReader();
    reader.onload = function (e) {
      chrome.runtime.sendMessage({ action: "restoreTabs", data: e.target.result }, (response) => {
        setStatus(response ? response : "Unknown Message. Please try again.");
      });
    };
    reader.readAsText(file.files[0]);
  });
});

function setStatus(status) {
  statusDiv.textContent = status;
}

// relaod extension
document.getElementById("reload").addEventListener("click", () => {
  chrome.runtime.reload();
});

document.getElementById("closeAll").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "closeAll", preventWinClose: true });
});

chrome.storage.local.get("browserSync", (data) => {
  document.getElementById("sync").checked = data.browserSync;
  document.getElementById("sync").addEventListener("click", (e) => {
    chrome.runtime.sendMessage({ action: "sync", status: e.target.checked });
  });
});

chrome.storage.local.get("encryption", (data) => {
  document.getElementById("enc").checked = data.encryption;
  document.getElementById("enc").addEventListener("click", (e) => {
    chrome.storage.local.set({ encryption: e.target.checked });
  })
});