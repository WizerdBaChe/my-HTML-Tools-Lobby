const frame = document.getElementById("previewFrame");
const clearBtn = document.getElementById("clearPreview");

document.querySelectorAll("button[data-src]").forEach(btn => {
  btn.addEventListener("click", () => {
    frame.src = btn.dataset.src;
  });
});

clearBtn.addEventListener("click", () => {
  frame.src = "";
});
