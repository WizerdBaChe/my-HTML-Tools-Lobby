// 檔案合併工具 - JavaScript 主程式
// 所有程式碼必須包裹在 DOMContentLoaded 事件監聽器中
document.addEventListener('DOMContentLoaded', function() {
    
    // === 核心變數宣告 ===
    // 用於儲存三個檔案的內容
    let htmlContent = null;
    let cssContent = null;
    let jsContent = null;
    
    // DOM 元素引用
    const elements = {
        htmlInput: document.getElementById('html-input'),
        cssInput: document.getElementById('css-input'),
        jsInput: document.getElementById('js-input'),
        htmlStatus: document.getElementById('html-status'),
        cssStatus: document.getElementById('css-status'),
        jsStatus: document.getElementById('js-status'),
        errorMessage: document.getElementById('error-message'),
        errorText: document.getElementById('error-text'),
        mergeBtn: document.getElementById('merge-btn')
    };
    
    // 檔案類型設定
    const fileTypes = {
        html: {
            extensions: ['.html', '.htm'],
            label: 'HTML',
            variable: 'htmlContent',
            statusElement: 'htmlStatus',
            cardElement: null
        },
        css: {
            extensions: ['.css'],
            label: 'CSS',
            variable: 'cssContent',
            statusElement: 'cssStatus',
            cardElement: null
        },
        js: {
            extensions: ['.js'],
            label: 'JavaScript',
            variable: 'jsContent',
            statusElement: 'jsStatus',
            cardElement: null
        }
    };
    
    // 獲取上傳卡片元素
    fileTypes.html.cardElement = elements.htmlInput.closest('.upload-card');
    fileTypes.css.cardElement = elements.cssInput.closest('.upload-card');
    fileTypes.js.cardElement = elements.jsInput.closest('.upload-card');
    
    // === 錯誤處理函數 ===
    function showError(message) {
        elements.errorText.textContent = message;
        elements.errorMessage.classList.remove('hidden');
        // 自動滾動到錯誤訊息
        elements.errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    function hideError() {
        elements.errorMessage.classList.add('hidden');
        elements.errorText.textContent = '';
    }
    
    // === 檔案驗證函數 ===
    function validateFile(file, fileType) {
        // 檔案類型驗證
        const fileName = file.name.toLowerCase();
        const validExtensions = fileTypes[fileType].extensions;
        const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
        
        if (!hasValidExtension) {
            const expectedExtensions = validExtensions.join(' 或 ');
            return `錯誤：請為 ${fileTypes[fileType].label} 區域選擇一個 ${expectedExtensions} 檔案`;
        }
        
        // 空檔案驗證
        if (file.size === 0) {
            return '錯誤：選擇的檔案是空檔案，請選擇有效的檔案';
        }
        
        // 檔案大小合理性檢查（超過 10MB 給出警告）
        if (file.size > 10 * 1024 * 1024) {
            return `警告：${fileTypes[fileType].label} 檔案過大 (${(file.size / 1024 / 1024).toFixed(2)}MB)，可能會影響合併效果`;
        }
        
        return null; // 無錯誤
    }
    
    // === 狀態更新函數 ===
    function updateFileStatus(fileType, fileName, isSuccess = true) {
        const statusElement = elements[fileTypes[fileType].statusElement];
        const cardElement = fileTypes[fileType].cardElement;
        
        if (isSuccess) {
            statusElement.textContent = `✅ 已上傳：${fileName}`;
            statusElement.classList.add('success');
            cardElement.classList.add('has-file');
            cardElement.classList.remove('has-error');
        } else {
            statusElement.textContent = '尚未上傳';
            statusElement.classList.remove('success');
            cardElement.classList.remove('has-file');
            cardElement.classList.add('has-error');
            // 重置檔案輸入
            const inputElement = cardElement.querySelector('input[type="file"]');
            if (inputElement) {
                inputElement.value = '';
            }
        }
    }
    
    // === 按鈕狀態檢查函數 ===
    function checkMergeButtonState() {
        const allFilesReady = htmlContent !== null && cssContent !== null && jsContent !== null;
        
        elements.mergeBtn.disabled = !allFilesReady;
        
        if (allFilesReady) {
            elements.mergeBtn.textContent = '合併並下載';
            elements.mergeBtn.classList.remove('loading');
        }
    }
    
    // === 檔案讀取函數 ===
    function readFile(file, fileType) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                resolve(e.target.result);
            };
            
            reader.onerror = function() {
                reject(new Error('檔案讀取失敗'));
            };
            
            // 使用 readAsText 來確保正確的文字編碼
            reader.readAsText(file, 'UTF-8');
        });
    }
    
    // === 檔案處理函數 ===
    async function handleFileSelection(file, fileType) {
        // 清除之前的錯誤訊息
        hideError();
        
        // 檔案驗證
        const validationError = validateFile(file, fileType);
        if (validationError) {
            showError(validationError);
            // 清空對應的變數內容
            window[fileTypes[fileType].variable] = null;
            updateFileStatus(fileType, '', false);
            checkMergeButtonState();
            return;
        }
        
        // 檔案讀取（包裹在 try-catch 中）
        try {
            const content = await readFile(file, fileType);
            
            // 內容基本驗證
            if (typeof content !== 'string' || content.trim().length === 0) {
                throw new Error('檔案內容為空或格式不正確');
            }
            
            // 特定檔案類型的內容驗證
            if (fileType === 'html' && !content.includes('<html') && !content.includes('<!DOCTYPE')) {
                console.warn('HTML 檔案可能缺少基本結構，但將繼續處理');
            }
            
            // 儲存檔案內容
            switch (fileType) {
                case 'html':
                    htmlContent = content;
                    break;
                case 'css':
                    cssContent = content;
                    break;
                case 'js':
                    jsContent = content;
                    break;
            }
            
            // 更新狀態顯示
            updateFileStatus(fileType, file.name, true);
            
            // 檢查合併按鈕狀態
            checkMergeButtonState();
            
        } catch (error) {
            console.error(`讀取 ${fileTypes[fileType].label} 檔案時發生錯誤:`, error);
            showError(`錯誤：讀取 ${fileTypes[fileType].label} 檔案時發生問題，請重新選擇檔案`);
            
            // 清空對應的變數內容
            switch (fileType) {
                case 'html':
                    htmlContent = null;
                    break;
                case 'css':
                    cssContent = null;
                    break;
                case 'js':
                    jsContent = null;
                    break;
            }
            
            updateFileStatus(fileType, '', false);
            checkMergeButtonState();
        }
    }
    
    // === 檔案合併函數 ===
    function mergeFiles() {
        try {
            // 清理 HTML 內容，移除重複的標籤
            let cleanHtmlContent = htmlContent;
            
            // 如果 HTML 包含完整的文檔結構，提取 body 內容
            if (cleanHtmlContent.includes('<body')) {
                const bodyMatch = cleanHtmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                if (bodyMatch) {
                    cleanHtmlContent = bodyMatch[1];
                }
            } else {
                // 移除可能的 HTML 標籤
                cleanHtmlContent = cleanHtmlContent.replace(/<(!DOCTYPE|html|head|title|meta|link|style|script)[^>]*>/gi, '')
                                                   .replace(/<\/(html|head|title|meta|link|style|script)>/gi, '');
            }
            
            // 建立完整的 HTML 文檔結構
            const mergedContent = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Merged Application</title>
    <style>
/* === 合併的 CSS 內容 === */
${cssContent}
    </style>
</head>
<body>
<!-- === 原始 HTML 內容 === -->
${cleanHtmlContent}

<!-- === 合併的 JavaScript 內容 === -->
<script>
${jsContent}
</script>
</body>
</html>`;

            return mergedContent;
            
        } catch (error) {
            console.error('合併檔案時發生錯誤:', error);
            throw new Error('合併檔案時發生問題，請檢查檔案內容是否正確');
        }
    }
    
    // === 檔案下載函數 ===
    function downloadMergedFile(content) {
        try {
            // 建立 Blob 物件
            const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
            
            // 建立下載連結
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'merged-app.html';
            
            // 確保連結不可見
            link.style.display = 'none';
            
            // 觸發下載
            document.body.appendChild(link);
            link.click();
            
            // 清理
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('下載檔案時發生錯誤:', error);
            throw new Error('下載檔案時發生問題');
        }
    }
    
    // === 阻止事件冒泡的輔助函數 ===
    function stopEventPropagation(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }
    
    // === 事件監聽器設定 ===
    
    // HTML 檔案輸入事件
    elements.htmlInput.addEventListener('change', function(e) {
        stopEventPropagation(e);
        const file = e.target.files[0];
        if (file) {
            handleFileSelection(file, 'html');
        }
    });
    
    // CSS 檔案輸入事件
    elements.cssInput.addEventListener('change', function(e) {
        stopEventPropagation(e);
        const file = e.target.files[0];
        if (file) {
            handleFileSelection(file, 'css');
        }
    });
    
    // JavaScript 檔案輸入事件
    elements.jsInput.addEventListener('change', function(e) {
        stopEventPropagation(e);
        const file = e.target.files[0];
        if (file) {
            handleFileSelection(file, 'js');
        }
    });
    
    // 合併並下載按鈕事件
    elements.mergeBtn.addEventListener('click', async function(e) {
        stopEventPropagation(e);
        
        if (elements.mergeBtn.disabled) return;
        
        // 清除錯誤訊息
        hideError();
        
        // 設定按鈕載入狀態
        elements.mergeBtn.classList.add('loading');
        elements.mergeBtn.textContent = '處理中...';
        elements.mergeBtn.disabled = true;
        
        try {
            // 再次確認所有檔案都已就緒
            if (!htmlContent || !cssContent || !jsContent) {
                throw new Error('請確保所有三個檔案都已成功上傳');
            }
            
            // 合併檔案
            const mergedContent = mergeFiles();
            
            // 下載檔案
            downloadMergedFile(mergedContent);
            
            // 顯示成功訊息（可選）
            console.log('檔案合併完成並已開始下載');
            
        } catch (error) {
            console.error('合併或下載過程中發生錯誤:', error);
            showError(error.message || '發生未知錯誤，請重新操作');
        } finally {
            // 恢復按鈕狀態
            setTimeout(() => {
                elements.mergeBtn.classList.remove('loading');
                checkMergeButtonState();
            }, 1000);
        }
    });
    
    // 阻止所有卡片區域的拖放事件，避免意外的 UI 狀態
    [fileTypes.html.cardElement, fileTypes.css.cardElement, fileTypes.js.cardElement].forEach(card => {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            card.addEventListener(eventName, stopEventPropagation, false);
        });
    });
    
    // === 初始化完成 ===
    console.log('檔案合併工具初始化完成');
    
    // 執行初始狀態檢查
    checkMergeButtonState();
});