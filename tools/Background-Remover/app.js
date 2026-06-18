// ============================================================
// 1. 後端核心優化運算引擎 (邊界連通域洪泛演算法版)
// ============================================================
function removeBackground(imageData, targetColor, tolerance, options = {}) {
  const { width, height } = imageData;
  const originalData = imageData.data;
  const resultData = new Uint8ClampedArray(originalData);

  const featherZone = options.featherZone !== undefined ? options.featherZone : 20;
  const enableSpillComp = options.enableSpillComp !== undefined ? options.enableSpillComp : true;
  
  const isWhiteBg = targetColor.r > 220 && targetColor.g > 220 && targetColor.b > 220;
  const isBlackBg = targetColor.r < 35 && targetColor.g < 35 && targetColor.b < 35;

  // 感知色彩距離
  function getPerceptualDistance(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    let rWeight = 0.299, gWeight = 0.587, bWeight = 0.114;

    if (isWhiteBg || isBlackBg) {
      rWeight = 0.333; gWeight = 0.333; bWeight = 0.333;
    }
    return Math.sqrt(dr * dr * rWeight + dg * dg * gWeight + db * db * bWeight);
  }

  // --------------------------------------------------------
  // 【核心升級】第一階段：建立邊界連通性遮罩 (Spatial Connectedness Mask)
  // --------------------------------------------------------
  const connectedMask = new Uint8Array(width * height); 
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  // 輔助檢驗像素是否匹配背景條件
  function isBackgroundPixel(x, y) {
    const idx = (y * width + x) * 4;
    const r = originalData[idx];
    const g = originalData[idx + 1];
    const b = originalData[idx + 2];
    
    let distance = getPerceptualDistance(r, g, b, targetColor.r, targetColor.g, targetColor.b);
    
    // 針對白底陰影進行動態容差補償，使其更容易被包含在蔓延範圍內
    if (isWhiteBg) {
      const brightness = (r + g + b) / 3;
      if (brightness > 140) distance += (brightness - 140) * 0.3;
    }
    
    // 只要色差在容差與羽化過渡帶的大極限內，皆視為潛在連通背景
    return distance <= (tolerance + featherZone);
  }

  // 推入洪泛隊列
  function enqueue(x, y) {
    const offset = y * width + x;
    if (connectedMask[offset] === 0) {
      connectedMask[offset] = 1;
      queueX[tail] = x;
      queueY[tail] = y;
      tail++;
    }
  }

  // 注入種子：將圖片的四個最外圈邊緣像素全部作為起點注入
  for (let x = 0; x < width; x++) {
    if (isBackgroundPixel(x, 0)) enqueue(x, 0);
    if (isBackgroundPixel(x, height - 1)) enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    if (isBackgroundPixel(0, y)) enqueue(0, y);
    if (isBackgroundPixel(width - 1, y)) enqueue(width - 1, y);
  }

  // 執行非遞迴的高效率隊列洪泛蔓延
  const dx = [1, -1, 0, 0];
  const dy = [0, 0, 1, -1];

  while (head < tail) {
    const cx = queueX[head];
    const cy = queueY[head];
    head++;

    for (let i = 0; i < 4; i++) {
      const nx = cx + dx[i];
      const ny = cy + dy[i];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (isBackgroundPixel(nx, ny)) {
          enqueue(nx, ny);
        }
      }
    }
  }

  // --------------------------------------------------------
  // 第二階段：遮罩融合計算與邊緣補償
  // --------------------------------------------------------
  for (let i = 0; i < originalData.length; i += 4) {
    const pixelOffset = i / 4;
    
    // 如果該像素不與外圍背景連通，代表被主體輪廓鎖在內部，100% 豁免去背
    if (connectedMask[pixelOffset] === 0) {
      continue; 
    }

    const r = originalData[i];
    const g = originalData[i + 1];
    const b = originalData[i + 2];
    const a = originalData[i + 3];

    let distance = getPerceptualDistance(r, g, b, targetColor.r, targetColor.g, targetColor.b);
    if (isWhiteBg) {
      const brightness = (r + g + b) / 3;
      if (brightness > 150) distance += (brightness - 150) * 0.25;
    }

    // 進行去背渲染
    if (distance <= tolerance) {
      resultData[i + 3] = 0;
    } else if (distance < tolerance + featherZone) {
      const alphaFactor = (distance - tolerance) / featherZone;
      const targetAlpha = Math.floor(a * alphaFactor);
      
      resultData[i + 3] = targetAlpha;

      if (enableSpillComp && targetAlpha > 0) {
        const weight = 1 - alphaFactor;
        resultData[i]     = Math.min(255, Math.max(0, (r - targetColor.r * weight) / alphaFactor));
        resultData[i + 1] = Math.min(255, Math.max(0, (g - targetColor.g * weight) / alphaFactor));
        resultData[i + 2] = Math.min(255, Math.max(0, (b - targetColor.b * weight) / alphaFactor));
      }
    } else {
      resultData[i + 3] = a;
    }
  }

  return new ImageData(resultData, width, height);
}

// ============================================================
// 2. 狀態管理與 DOM 映射層
// ============================================================
const AppState = { IDLE: 'idle', LOADED: 'loaded', PROCESSING: 'processing' };
let currentState = AppState.IDLE;
let currentImgElement = null;
let originalImageData = null;
let targetColor = { r: 255, g: 255, b: 255 };
let bgPresetMode = 'white'; 
let isEyedropperActive = false;
let dragCounter = 0; 

const dom = {
  fileInput: document.getElementById('fileInput'),
  dropZone: document.getElementById('dropZone'),
  dropOverlay: document.getElementById('dropOverlay'),
  bgSegmented: document.getElementById('bgPresetSegmented'),
  toleranceSlider: document.getElementById('toleranceSlider'),
  toleranceValue: document.getElementById('toleranceValue'),
  featherSlider: document.getElementById('featherSlider'),
  featherValue: document.getElementById('featherValue'),
  spillToggle: document.getElementById('spillToggle'),
  customColorInfo: document.getElementById('customColorInfo'),
  colorIndicator: document.getElementById('colorIndicator'),
  colorText: document.getElementById('colorText'),
  eyedropperBtn: document.getElementById('eyedropperBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  resetBtn: document.getElementById('resetBtn'),
  windowFileName: document.getElementById('windowFileName'),
  statusMessage: document.getElementById('statusMessage'),
  originalCanvas: document.getElementById('originalCanvas'),
  previewCanvas: document.getElementById('previewCanvas'),
  spinner: document.getElementById('processingSpinner')
};

const oCtx = dom.originalCanvas.getContext('2d', { willReadFrequently: true });
const pCtx = dom.previewCanvas.getContext('2d');

function debounce(func, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

function setAppState(state, msg = '') {
  currentState = state;
  const isIdle = state === AppState.IDLE;
  const isProcessing = state === AppState.PROCESSING;

  dom.eyedropperBtn.disabled = isIdle || isProcessing;
  dom.downloadBtn.disabled = isIdle || isProcessing;
  dom.resetBtn.disabled = isIdle || isProcessing;
  dom.toleranceSlider.disabled = isIdle || isProcessing;
  dom.featherSlider.disabled = isIdle || isProcessing;
  
  dom.spinner.classList.toggle('hidden', !isProcessing);
  if (msg) dom.statusMessage.textContent = msg;
}

function initCanvasDisplay(img) {
  const maxDisplayWidth = 620; 
  const aspect = img.width / img.height;
  let dw, dh;

  if (img.width > img.height) {
    dw = Math.min(maxDisplayWidth, img.width);
    dh = dw / aspect;
  } else {
    dh = Math.min(480, img.height);
    dw = dh * aspect;
  }

  dom.originalCanvas.width = img.width;
  dom.originalCanvas.height = img.height;
  dom.originalCanvas.style.width = `${dw}px`;
  dom.originalCanvas.style.height = `${dh}px`;

  dom.previewCanvas.width = img.width;
  dom.previewCanvas.height = img.height;
  dom.previewCanvas.style.width = `${dw}px`;
  dom.previewCanvas.style.height = `${dh}px`;

  oCtx.clearRect(0, 0, img.width, img.height);
  oCtx.drawImage(img, 0, 0);
  originalImageData = oCtx.getImageData(0, 0, img.width, img.height);
}

const dispatchExecution = debounce(function() {
  if (!originalImageData) return;
  setAppState(AppState.PROCESSING, '正在執行連通域淨化...');
  
  setTimeout(() => {
    const tolerance = parseInt(dom.toleranceSlider.value);
    const featherZone = parseInt(dom.featherSlider.value);
    const enableSpillComp = dom.spillToggle.getAttribute('data-on') === 'true';

    const result = removeBackground(originalImageData, targetColor, tolerance, {
      featherZone,
      enableSpillComp
    });

    pCtx.clearRect(0, 0, dom.previewCanvas.width, dom.previewCanvas.height);
    pCtx.putImageData(result, 0, 0);
    setAppState(AppState.LOADED, '去背隔離完成');
  }, 40);
}, 100);

function handlePresetChange(mode) {
  bgPresetMode = mode;
  
  Array.from(dom.bgSegmented.children).forEach(btn => {
    btn.setAttribute('data-active', btn.getAttribute('data-value') === mode ? 'true' : 'false');
  });

  if (mode === 'white') {
    targetColor = { r: 255, g: 255, b: 255 };
    dom.customColorInfo.style.opacity = '0.5';
    dom.toleranceSlider.value = 35;
    dom.featherSlider.value = 25;
  } else if (mode === 'black') {
    targetColor = { r: 0, g: 0, b: 0 };
    dom.customColorInfo.style.opacity = '0.5';
    dom.toleranceSlider.value = 25;
    dom.featherSlider.value = 15;
  } else {
    dom.customColorInfo.style.opacity = '1';
  }
  
  dom.toleranceValue.textContent = dom.toleranceSlider.value;
  dom.featherValue.textContent = dom.featherSlider.value;
  updateColorPreviewUI();
  dispatchExecution();
}

function updateColorPreviewUI() {
  const rgbStr = `rgb(${targetColor.r},${targetColor.g},${targetColor.b})`;
  dom.colorIndicator.style.background = rgbStr;
  dom.colorText.textContent = `RGB(${targetColor.r},${targetColor.g},${targetColor.b})`;
}

function handleFileImport(file) {
  if (!file || !file.type.startsWith('image/')) return;
  
  setAppState(AppState.PROCESSING, '解析並建立影像拓撲...');
  dom.windowFileName.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      currentImgElement = img;
      initCanvasDisplay(img);
      handlePresetChange(bgPresetMode); 
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function handleCanvasIntersection(e) {
  if (!isEyedropperActive || !originalImageData) return;

  const rect = dom.originalCanvas.getBoundingClientRect();
  const scaleX = dom.originalCanvas.width / rect.width;
  const scaleY = dom.originalCanvas.height / rect.height;

  const x = Math.floor((e.clientX - rect.left) * scaleX);
  const y = Math.floor((e.clientY - rect.top) * scaleY);

  const targetX = Math.max(0, Math.min(x, dom.originalCanvas.width - 1));
  const targetY = Math.max(0, Math.min(y, dom.originalCanvas.height - 1));

  const pixelIdx = (targetY * dom.originalCanvas.width + targetX) * 4;
  const rawData = originalImageData.data;

  targetColor = {
    r: rawData[pixelIdx],
    g: rawData[pixelIdx + 1],
    b: rawData[pixelIdx + 2]
  };

  updateColorPreviewUI();
  deactivateEyedropper();
  handlePresetChange('custom');
}

function activateEyedropper() {
  isEyedropperActive = true;
  dom.eyedropperBtn.style.outline = "2px solid var(--al-accent)";
  dom.eyedropperBtn.textContent = '❌ 請在左圖點選背景色';
  dom.originalCanvas.style.cursor = 'crosshair';
}

function deactivateEyedropper() {
  isEyedropperActive = false;
  dom.eyedropperBtn.style.outline = "none";
  dom.eyedropperBtn.textContent = '🎨 色彩吸管';
  dom.originalCanvas.style.cursor = 'default';
}

function initListeners() {
  dom.dropZone.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', (e) => handleFileImport(e.target.files[0]));

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dom.dropOverlay.classList.remove('hidden');
  });

  window.addEventListener('dragover', (e) => e.preventDefault());

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) dom.dropOverlay.classList.add('hidden');
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dom.dropOverlay.classList.add('hidden');
    if (e.dataTransfer.files.length > 0) handleFileImport(e.dataTransfer.files[0]);
  });

  dom.bgSegmented.addEventListener('click', (e) => {
    const btn = e.target.closest('.al-segmented-item');
    if (btn) handlePresetChange(btn.getAttribute('data-value'));
  });

  dom.toleranceSlider.addEventListener('input', function() {
    dom.toleranceValue.textContent = this.value;
    dispatchExecution();
  });
  
  dom.featherSlider.addEventListener('input', function() {
    dom.featherValue.textContent = this.value;
    dispatchExecution();
  });

  dom.spillToggle.addEventListener('click', function() {
    const isOn = this.getAttribute('data-on') === 'true';
    this.setAttribute('data-on', isOn ? 'false' : 'true');
    dispatchExecution();
  });

  dom.eyedropperBtn.addEventListener('click', () => {
    if (isEyedropperActive) deactivateEyedropper(); else activateEyedropper();
  });
  
  dom.originalCanvas.addEventListener('mousedown', handleCanvasIntersection);

  dom.downloadBtn.addEventListener('click', () => {
    if (!dom.previewCanvas) return;
    dom.previewCanvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `purged_${Date.now()}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  });

  dom.resetBtn.addEventListener('click', () => {
    if (currentImgElement) {
      initCanvasDisplay(currentImgElement);
      handlePresetChange(bgPresetMode);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initListeners();
  setAppState(AppState.IDLE, '等待匯入產品圖檔...');
});