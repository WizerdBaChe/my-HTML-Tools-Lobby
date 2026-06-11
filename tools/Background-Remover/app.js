// 應用程式狀態管理
const AppState = {
  IDLE: 'idle',
  IMAGE_LOADED: 'image_loaded',
  PROCESSING: 'processing',
  DONE: 'done'
};

// 參數設置
const CONFIG = {
  defaultTolerance: 30,
  maxFileSize: 10485760, // 10MB
  maxResolution: 4000,
  supportedFormats: ['image/png', 'image/jpeg', 'image/webp'],
  debounceDelay: 150
};

// 全域變數
let currentState = AppState.IDLE;
let originalImageData = null;
let originalCanvas = null;
let previewCanvas = null;
let originalCtx = null;
let previewCtx = null;
let targetColor = { r: 255, g: 255, b: 255 };
let tolerance = CONFIG.defaultTolerance;
let isEyedropperActive = false;
let currentImage = null;
let elements = {};

// Debounce工具函式
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// RGB歐氏距離
function calculateColorDistance(color1, color2) {
  const deltaR = color1.r - color2.r;
  const deltaG = color1.g - color2.g;
  const deltaB = color1.b - color2.b;
  return Math.sqrt(deltaR ** 2 + deltaG ** 2 + deltaB ** 2);
}

// 去背核心演算法
function removeBackground(imageData, targetColor, tolerance) {
  const data = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < data.length; i += 4) {
    const pixel = { r: data[i], g: data[i+1], b: data[i+2] };
    const distance = calculateColorDistance(pixel, targetColor);
    if (distance <= tolerance) data[i+3] = 0; // alpha透明
  }
  return new ImageData(data, imageData.width, imageData.height);
}

function setState(newState) {
  currentState = newState;
  updateUI();
  updateStatusDisplay();
}

function updateStatusDisplay() {
  const text = elements.statusText;
  const msgs = {
    [AppState.IDLE]: '等待上傳圖片...',
    [AppState.IMAGE_LOADED]: '圖片已載入，點擊原圖選擇要去背的顏色',
    [AppState.PROCESSING]: '處理中，請稍候...',
    [AppState.DONE]: '處理完成，可下載圖片'
  };
  text.textContent = msgs[currentState] || '';
}

function updateUI() {
  const isIdle = currentState === AppState.IDLE;
  const hasImage = currentState !== AppState.IDLE;
  const isProcessing = currentState === AppState.PROCESSING;
  const canDownload = currentState === AppState.IMAGE_LOADED || currentState === AppState.DONE;
  elements.previewSection.classList.toggle('hidden', isIdle);
  elements.controlsSection.classList.toggle('hidden', isIdle);
  elements.eyedropperBtn.disabled = !hasImage || isProcessing;
  elements.toleranceSlider.disabled = !hasImage || isProcessing;
  elements.resetBtn.disabled = !hasImage || isProcessing;
  elements.downloadBtn.disabled = !canDownload || isProcessing;
  elements.loadingSpinner.classList.toggle('hidden', !isProcessing);
  elements.eyedropperOverlay.classList.toggle('hidden', !isEyedropperActive);
}

// 檔案驗證
function validateFile(file) {
  const errors = [];
  if (!CONFIG.supportedFormats.includes(file.type)) errors.push('僅支援 PNG、JPEG、WebP。');
  if (file.size > CONFIG.maxFileSize) errors.push('檔案勿超過10MB。');
  return errors;
}

// 載入圖片
function loadImage(file) {
  const errs = validateFile(file);
  if (errs.length) { alert('檔案驗證失敗:\n' + errs.join('\n')); return; }
  setState(AppState.PROCESSING);
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      if (img.width > CONFIG.maxResolution || img.height > CONFIG.maxResolution) {
        alert('解析度不可超過4000x4000。');
        setState(AppState.IDLE); return;
      }
      currentImage = img;
      setupCanvases(img);
      setState(AppState.IMAGE_LOADED);
    };
    img.onerror = function() {
      alert('圖片載入失敗');
      setState(AppState.IDLE);
    };
    img.src = e.target.result;
  };
  reader.onerror = function() {
    alert('檔案讀取失敗');
    setState(AppState.IDLE);
  };
  reader.readAsDataURL(file);
}

function setupCanvases(img) {
  // 計算顯示尺寸
  const maxW = 400, maxH = 400;
  const aspect = img.width / img.height;
  let dw, dh;
  if (img.width > img.height) {
    dw = Math.min(maxW, img.width);
    dh = dw / aspect;
  } else {
    dh = Math.min(maxH, img.height);
    dw = dh * aspect;
  }
  // 原圖canvas
  originalCanvas.width = img.width;
  originalCanvas.height = img.height;
  originalCanvas.style.width = dw + 'px';
  originalCanvas.style.height = dh + 'px';
  originalCtx.clearRect(0, 0, img.width, img.height);
  originalCtx.drawImage(img, 0, 0);
  originalImageData = originalCtx.getImageData(0, 0, img.width, img.height);
  // 預覽canvas
  previewCanvas.width = img.width;
  previewCanvas.height = img.height;
  previewCanvas.style.width = dw + 'px';
  previewCanvas.style.height = dh + 'px';
  previewCtx.clearRect(0, 0, img.width, img.height);
  previewCtx.drawImage(img, 0, 0);
}

// 去背流程（debounce）
const processBackgroundRemoval = debounce(function() {
  if (!originalImageData || currentState === AppState.PROCESSING) return;
  setState(AppState.PROCESSING);
  setTimeout(() => {
    try {
      const resultData = removeBackground(originalImageData, targetColor, tolerance);
      previewCtx.putImageData(resultData, 0, 0);
      setState(AppState.DONE);
    } catch (err) {
      alert('去背失敗');
      setState(AppState.IMAGE_LOADED);
    }
  }, 50);
}, CONFIG.debounceDelay);

// 滴管功能
function handleCanvasClick(event) {
  if (!isEyedropperActive || !originalImageData) return;
  const rect = originalCanvas.getBoundingClientRect();
  const scaleX = originalCanvas.width / rect.width;
  const scaleY = originalCanvas.height / rect.height;
  const x = Math.floor((event.clientX - rect.left) * scaleX);
  const y = Math.floor((event.clientY - rect.top) * scaleY);
  const clampedX = Math.max(0, Math.min(x, originalCanvas.width - 1));
  const clampedY = Math.max(0, Math.min(y, originalCanvas.height - 1));
  const idx = (clampedY * originalCanvas.width + clampedX) * 4;
  const imgData = originalImageData.data;
  targetColor = { r: imgData[idx], g: imgData[idx + 1], b: imgData[idx + 2] };
  updateColorDisplay();
  deactivateEyedropper();
  processBackgroundRemoval();
}

// 顏色顯示
function updateColorDisplay() {
  const rgb = `rgb(${targetColor.r},${targetColor.g},${targetColor.b})`;
  elements.selectedColorDisplay.style.backgroundColor = rgb;
  elements.selectedColorText.textContent = `RGB(${targetColor.r},${targetColor.g},${targetColor.b})`;
  elements.selectedColorDisplay.setAttribute('aria-label', `選中顏色：${rgb}`);
}

// 滴管啟用/停用
function activateEyedropper() {
  isEyedropperActive = true;
  elements.eyedropperBtn.innerHTML = '❌取消滴管';
  elements.eyedropperBtn.setAttribute('aria-label', '取消滴管工具');
  originalCanvas.style.cursor = 'crosshair';
  updateUI();
}
function deactivateEyedropper() {
  isEyedropperActive = false;
  elements.eyedropperBtn.innerHTML = '🎨滴管工具';
  elements.eyedropperBtn.setAttribute('aria-label', '啟用滴管工具選擇目標顏色');
  originalCanvas.style.cursor = 'default';
  updateUI();
}

// 重置功能
function resetSettings() {
  targetColor = { r: 255, g: 255, b: 255 };
  tolerance = CONFIG.defaultTolerance;
  elements.toleranceSlider.value = tolerance;
  elements.toleranceValue.textContent = tolerance;
  updateColorDisplay();
  if (currentImage && originalImageData) {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.drawImage(currentImage, 0, 0);
    setState(AppState.IMAGE_LOADED);
  }
  if (isEyedropperActive) deactivateEyedropper();
}

// 下載圖片
function downloadImage() {
  if (!previewCanvas) return;
  previewCanvas.toBlob(function(blob) {
    if (!blob) { alert('圖片生成失敗'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `removed-background-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

// 拖曳事件
function handleDragOver(event) {
  event.preventDefault(); event.stopPropagation();
  elements.dropZone.classList.add('drag-over');
}
function handleDragLeave(event) {
  event.preventDefault(); event.stopPropagation();
  elements.dropZone.classList.remove('drag-over');
}
function handleDrop(event) {
  event.preventDefault(); event.stopPropagation();
  elements.dropZone.classList.remove('drag-over');
  const files = Array.from(event.dataTransfer.files);
  const imgFile = files.find(f => f.type.startsWith('image/'));
  if (imgFile) loadImage(imgFile); else alert('請拖曳圖片檔案');
}

// 初始化
function initializeElements() {
  elements = {
    fileInput: document.getElementById('fileInput'),
    dropZone: document.getElementById('dropZone'),
    previewSection: document.getElementById('previewSection'),
    controlsSection: document.getElementById('controlsSection'),
    originalCanvas: document.getElementById('originalCanvas'),
    previewCanvas: document.getElementById('previewCanvas'),
    eyedropperBtn: document.getElementById('eyedropperBtn'),
    eyedropperOverlay: document.getElementById('eyedropperOverlay'),
    toleranceSlider: document.getElementById('toleranceSlider'),
    toleranceValue: document.getElementById('toleranceValue'),
    selectedColorDisplay: document.getElementById('selectedColorDisplay'),
    selectedColorText: document.getElementById('selectedColorText'),
    resetBtn: document.getElementById('resetBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    loadingSpinner: document.getElementById('loadingSpinner'),
    statusText: document.getElementById('statusText')
  };
  originalCanvas = elements.originalCanvas;
  previewCanvas = elements.previewCanvas;
  if (originalCanvas && previewCanvas) {
    originalCtx = originalCanvas.getContext('2d');
    previewCtx = previewCanvas.getContext('2d');
  } else {
    alert('找不到 canvas 元件');
  }
}

function initializeEventListeners() {
  elements.fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0]; if (file) loadImage(file);
  });
  elements.dropZone.addEventListener('dragover', handleDragOver);
  elements.dropZone.addEventListener('dragleave', handleDragLeave);
  elements.dropZone.addEventListener('drop', handleDrop);
  elements.dropZone.addEventListener('click', function() {
    elements.fileInput.click();
  });
  elements.dropZone.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); elements.fileInput.click();
    }
  });
  if (originalCanvas) {
    originalCanvas.addEventListener('click', handleCanvasClick);
  }
  if (elements.eyedropperBtn) {
    elements.eyedropperBtn.addEventListener('click', function() {
      if (isEyedropperActive) deactivateEyedropper();
      else activateEyedropper();
    });
  }
  if (elements.toleranceSlider) {
    elements.toleranceSlider.addEventListener('input', function() {
      tolerance = parseInt(this.value);
      elements.toleranceValue.textContent = tolerance;
      processBackgroundRemoval();
    });
  }
  if (elements.resetBtn) {
    elements.resetBtn.addEventListener('click', resetSettings);
  }
  if (elements.downloadBtn) {
    elements.downloadBtn.addEventListener('click', downloadImage);
  }
}

// DOM 完成初始化
document.addEventListener('DOMContentLoaded', function() {
  initializeElements();
  initializeEventListeners();
  updateColorDisplay();
  setState(AppState.IDLE);
  if (!window.FileReader || !document.createElement('canvas').getContext) {
    alert('此瀏覽器不支援所有功能，請升級。');
  }
});
