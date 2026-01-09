// Global state
let allExtractions = [];
let currentExtraction = null;
let appData = null;
let extractPath = null;
let currentLightboxImage = { url: '', filename: '' };

// DOM Elements
const uploadZone = document.getElementById('uploadZone');
const viewer = document.getElementById('viewer');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const processing = document.getElementById('processing');
const errorMessage = document.getElementById('errorMessage');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const processingText = document.getElementById('processingText');
const historyPanel = document.getElementById('historyPanel');
const historyList = document.getElementById('historyList');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadAllExtractions();
    loadHistory();
});

function setupEventListeners() {
    fileInput.addEventListener('change', handleFileSelect);

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
}

function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
}

async function handleFile(file) {
    if (!file.name.endsWith('.zip')) {
        showError('Chỉ chấp nhận file .zip');
        return;
    }

    if (file.size > 500 * 1024 * 1024) {
        showError(`File quá lớn (tối đa 500MB). File của bạn: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
        return;
    }

    try {
        showProcessing();

        const formData = new FormData();
        formData.append('zipFile', file);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 50;
                updateProgress(percent);
                processingText.textContent = `Đang upload... ${Math.round(percent)}%`;
            }
        });

        xhr.addEventListener('load', async () => {
            if (xhr.status === 200) {
                updateProgress(50);
                processingText.textContent = 'Đang xử lý file ZIP...';

                const response = JSON.parse(xhr.responseText);

                if (response.success) {
                    appData = response.data;
                    extractPath = response.extractPath;

                    for (let i = 50; i <= 100; i += 10) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        updateProgress(i);
                    }

                    setTimeout(() => {
                        showViewer();
                        loadHistory(); // Refresh history
                    }, 300);
                } else {
                    showError(response.error || 'Lỗi xử lý file');
                }
            } else {
                const error = JSON.parse(xhr.responseText);
                showError(error.error || 'Lỗi upload file');
            }
        });

        xhr.addEventListener('error', () => {
            showError('Lỗi kết nối server');
        });

        xhr.open('POST', '/api/upload');
        xhr.send(formData);

    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
    }
}

function showProcessing() {
    dropzone.style.display = 'none';
    errorMessage.style.display = 'none';
    processing.style.display = 'block';
    updateProgress(0);
}

function updateProgress(percent) {
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${Math.round(percent)}%`;
}

function showError(message) {
    processing.style.display = 'none';
    dropzone.style.display = 'none';
    errorMessage.style.display = 'block';
    document.getElementById('errorText').textContent = message;
}

function resetUpload() {
    uploadZone.style.display = 'flex';
    viewer.style.display = 'none';
    dropzone.style.display = 'block';
    processing.style.display = 'none';
    errorMessage.style.display = 'none';
    fileInput.value = '';
    appData = null;
    extractPath = null;
}

function showViewer() {
    renderTreeSidebar();
    if (appData) {
        renderContent();
        updateStats();
    }

    uploadZone.style.display = 'none';
    viewer.style.display = 'flex';
}

// History functions
async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        const data = await response.json();

        if (data.success && data.history.length > 0) {
            renderHistory(data.history);
        } else {
            historyList.innerHTML = '<p class="empty">Chưa có file nào được upload</p>';
        }
    } catch (error) {
        console.error('Error loading history:', error);
        historyList.innerHTML = '<p class="error">Lỗi tải lịch sử</p>';
    }
}

function renderHistory(history) {
    historyList.innerHTML = history.map(item => `
        <div class="history-item">
            <div class="history-info">
                <h3><i class="fas fa-file-archive"></i> ${item.filename}</h3>
                <p class="history-meta">
                    <span><i class="fas fa-clock"></i> ${formatDate(item.uploadDate)}</span>
                    <span><i class="fas fa-hdd"></i> ${formatSize(item.size)}</span>
                </p>
                <p class="history-stats">
                    ${item.totalPages} trang • ${item.totalImages} ảnh • ${item.totalTables} bảng
                </p>
            </div>
            <div class="history-actions">
                <button class="btn-small btn-view" onclick="loadExtraction('${item.id}')">
                    <i class="fas fa-eye"></i> Xem
                </button>
                <button class="btn-small btn-delete" onclick="deleteExtraction('${item.id}')">
                    <i class="fas fa-trash"></i> Xóa
                </button>
            </div>
        </div>
    `).join('');
}

async function loadExtraction(id) {
    try {
        toggleHistory(); // Close history panel
        showProcessing();
        processingText.textContent = 'Đang tải extraction...';

        const response = await fetch(`/api/extraction/${id}`);
        const data = await response.json();

        if (data.success) {
            appData = data.data;
            extractPath = data.extractPath;
            showViewer();
        } else {
            showError(data.error || 'Lỗi tải extraction');
        }
    } catch (error) {
        showError('Lỗi kết nối server');
    }
}

async function deleteExtraction(id) {
    if (!confirm('Bạn có chắc muốn xóa extraction này?')) return;

    try {
        const response = await fetch(`/api/extraction/${id}`, { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            loadHistory(); // Refresh history

            // Remove from allExtractions
            allExtractions = allExtractions.filter(e => e.id !== id);

            // If currently viewing this extraction, clear it
            if (currentExtraction === id) {
                currentExtraction = null;
                appData = null;
                extractPath = null;
            }

            // If no more extractions, go back to upload
            if (allExtractions.length === 0) {
                resetUpload();
            } else {
                renderTreeSidebar();
                if (!currentExtraction && allExtractions.length > 0) {
                    await loadExtractionData(allExtractions[0].id);
                }
            }
        }
    } catch (error) {
        alert('Lỗi xóa extraction');
    }
}

function toggleHistory() {
    if (historyPanel.style.display === 'none') {
        historyPanel.style.display = 'flex';
        loadHistory();
    } else {
        historyPanel.style.display = 'none';
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 7) return `${days} ngày trước`;

    return date.toLocaleDateString('vi-VN');
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// Load all extractions
async function loadAllExtractions() {
    try {
        const response = await fetch('/api/extractions');
        const data = await response.json();

        if (data.success) {
            allExtractions = data.extractions;

            // If we have extractions, show viewer with tree
            if (allExtractions.length > 0) {
                showViewer();
                // Load first extraction by default
                if (!currentExtraction && allExtractions.length > 0) {
                    await loadExtractionData(allExtractions[0].id);
                }
            }
        }
    } catch (error) {
        console.error('Error loading extractions:', error);
    }
}

// Render tree sidebar with all extractions
function renderTreeSidebar() {
    const sidebarContent = document.getElementById('sidebarContent');
    const extractionCount = document.getElementById('extractionCount');

    if (allExtractions.length === 0) {
        sidebarContent.innerHTML = '<p class="empty" style="padding: 1rem; text-align: center; color: var(--text-secondary);">Chưa có extraction nào</p>';
        extractionCount.textContent = '';
        return;
    }

    extractionCount.textContent = `${allExtractions.length} extraction${allExtractions.length > 1 ? 's' : ''}`;

    sidebarContent.innerHTML = allExtractions.map(extraction => {
        const isActive = currentExtraction === extraction.id;
        const formatDate = (dateStr) => {
            const date = new Date(dateStr);
            return date.toLocaleString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        // --- STATUS LOGIC ---
        let statusBadge = '';
        let actionButtons = '';
        let statsInfo = '';
        let clickAction = `toggleExtraction('${extraction.id}')`;
        let itemClass = isActive ? 'active' : '';

        // Status 0: New / Unprocessed
        if (extraction.status === 0) {
            statusBadge = '<span style="color:#f39c12; font-size:0.8em; font-weight:bold;"><i class="fas fa-pause-circle"></i> Chưa xử lý</span>';
            actionButtons = `
                <button class="btn-play-small" onclick="event.stopPropagation(); runProcessing('${extraction.id}')" title="Chạy xử lý" style="border:none; background:none; color: #27ae60; cursor:pointer; margin-right:5px; font-size:1.1rem;">
                    <i class="fas fa-play-circle"></i>
                </button>
                <button class="btn-delete-small" onclick="event.stopPropagation(); deleteExtraction('${extraction.id}')" title="Xóa">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            statsInfo = '<small style="color:#7f8c8d; font-style:italic;">Sẵn sàng chạy</small>';
            itemClass += ' status-new';
            clickAction = ''; // Prevent opening viewer for unprocessed items
        }
        // Status 1: Processing
        else if (extraction.status === 1) {
            statusBadge = '<span style="color:#3498db; font-size:0.8em; font-weight:bold;"><i class="fas fa-spinner fa-spin"></i> Đang xử lý...</span>';
            actionButtons = '';
            statsInfo = '<small style="color:#3498db">Vui lòng đợi...</small>';
            clickAction = '';
            itemClass += ' status-processing';
        }
        // Status 2: Done (or undefined/old)
        else {
            actionButtons = `
                <button class="btn-delete-small" onclick="event.stopPropagation(); deleteExtraction('${extraction.id}')" title="Xóa">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            statsInfo = `
                <div class="extraction-stats">
                    <span><i class="fas fa-file"></i> ${extraction.totalPages}</span>
                    <span><i class="fas fa-image"></i> ${extraction.totalImages}</span>
                    <span><i class="fas fa-table"></i> ${extraction.totalTables}</span>
                </div>
            `;
        }

        return `
            <div class="extraction-item ${itemClass}">
                <div class="extraction-header" onclick="${clickAction}" style="${extraction.status !== 2 && extraction.status !== undefined ? 'cursor:default;' : ''}">
                    <i class="fas fa-folder ${isActive ? 'fa-folder-open' : ''}"></i>
                    <div class="extraction-info">
                        <div class="extraction-name">
                            ${extraction.name}
                            ${statusBadge ? `<div style="margin-top:2px;">${statusBadge}</div>` : ''}
                        </div>
                        <div class="extraction-meta">
                            <small>${formatDate(extraction.created)}</small>
                        </div>
                        ${statsInfo.startsWith('<div') ? statsInfo : `<div class="extraction-stats">${statsInfo}</div>`}
                    </div>
                    <div style="display:flex; align-items:center;">
                        ${actionButtons}
                    </div>
                </div>
                <div class="extraction-pages" id="pages-${extraction.id}" style="display: ${isActive ? 'block' : 'none'};">
                    ${isActive && appData ? renderPagesForExtraction() : (extraction.status === 2 || extraction.status === undefined ? '<p style="padding: 0.5rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">Đang tải...</p>' : '')}
                </div>
            </div>
        `;
    }).join('');
}

function renderPagesForExtraction() {
    if (!appData || !appData.pages) return '';

    return appData.pages.map((page, index) => `
        <div class="page-item-tree" onclick="scrollToPage(${index})" data-page="${index}">
            <div class="page-number-small">${page.pageNumber}</div>
            <div class="page-info-small">
                <div class="page-title-small">Page ${page.pageNumber}</div>
                <div class="page-stats-small">
                    ${page.stats.images > 0 ? `<span><i class="fas fa-image"></i> ${page.stats.images}</span>` : ''}
                    ${page.stats.tables > 0 ? `<span><i class="fas fa-table"></i> ${page.stats.tables}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

async function toggleExtraction(extractionId) {
    if (currentExtraction === extractionId) {
        // Collapse
        currentExtraction = null;
        appData = null;
        extractPath = null;
        document.getElementById('contentFeed').innerHTML = '<p style="padding: 2rem; text-align: center; color: var(--text-secondary);">Chọn một extraction để xem nội dung</p>';
    } else {
        // Expand and load
        await loadExtractionData(extractionId);
    }
    renderTreeSidebar();
}

async function loadExtractionData(extractionId) {
    try {
        currentExtraction = extractionId;
        const response = await fetch(`/api/extraction/${extractionId}`);
        const data = await response.json();

        if (data.success) {
            appData = data.data;
            extractPath = data.extractPath;
            renderTreeSidebar();
            renderContent();
            updateStats();
        }
    } catch (error) {
        console.error('Error loading extraction:', error);
    }
}

function renderContent() {
    const contentFeed = document.getElementById('contentFeed');

    contentFeed.innerHTML = appData.pages.map(page => `
        <div class="page-section" id="page-${page.pageNumber}">
            <div class="section-header">
                <div class="section-number">${page.pageNumber}</div>
                <div class="section-title">
                    <h2>Trang ${page.pageNumber}</h2>
                    <p>${page.stats.images} ảnh, ${page.stats.tables} bảng, ${page.stats.textLength} ký tự</p>
                </div>
            </div>
            
            ${renderImages(page.images)}
            ${renderTables(page.tables)}
            ${renderText(page.text, page.pageNumber)}
        </div>
    `).join('');
}

function renderImages(images) {
    if (!images || images.length === 0) return '';

    return images.map(img => `
        <div class="card">
            <div class="card-header">
                <div class="card-title">
                    <i class="fas fa-image" style="color: var(--primary);"></i>
                    ${img.filename}
                </div>
                <div class="card-actions">
                    <button class="btn-small btn-view" onclick="openLightbox('/uploads/${extractPath}/${img.path}', '${img.filename}')">
                        <i class="fas fa-expand"></i> Xem
                    </button>
                    <button class="btn-small btn-download" onclick="downloadFile('/uploads/${extractPath}/${img.path}', '${img.filename}')">
                        <i class="fas fa-download"></i> Tải
                    </button>
                </div>
            </div>
            <div class="image-preview" onclick="openLightbox('/uploads/${extractPath}/${img.path}', '${img.filename}')">
                <img src="/uploads/${extractPath}/${img.path}" alt="${img.filename}" loading="lazy">
            </div>
        </div>
    `).join('');
}

function renderTables(tables) {
    if (!tables || tables.length === 0) return '';

    return tables.map(table => `
        <div class="card">
            <div class="card-header">
                <div class="card-title">
                    <i class="fas fa-table" style="color: var(--success);"></i>
                    ${table.filename}
                </div>
                <div class="card-actions">
                    <button class="btn-small btn-view" onclick="loadTable('${table.path}', '${table.filename}')">
                        <i class="fas fa-eye"></i> Xem
                    </button>
                    <button class="btn-small btn-download" onclick="downloadFile('/uploads/${extractPath}/${table.path}', '${table.filename}')">
                        <i class="fas fa-download"></i> Tải
                    </button>
                </div>
            </div>
            <div id="table-${table.filename}" class="table-container">
                <p style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                    Click "Xem" để load bảng
                </p>
            </div>
        </div>
    `).join('');
}

async function loadTable(tablePath, filename) {
    try {
        const response = await fetch(`/api/file/${extractPath}/${tablePath}`);
        const data = await response.json();

        const container = document.getElementById(`table-${filename}`);
        const firstSheet = data.sheets[0];

        container.innerHTML = `
            ${renderTableHTML(firstSheet.data)}
            <div class="table-footer">
                <span>Sheet: ${firstSheet.name}</span>
                <span>${firstSheet.data.length} hàng</span>
            </div>
        `;
    } catch (error) {
        console.error('Error loading table:', error);
    }
}

function renderTableHTML(data) {
    if (!data || data.length === 0) return '<p style="padding: 2rem; text-align: center;">Không có dữ liệu</p>';

    const headers = data[0];
    const rows = data.slice(1, 11);

    return `
        <table class="excel-table">
            <thead>
                <tr>
                    ${headers.map(h => `<th>${h || '-'}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>
                        ${row.map(cell => `<td>${cell !== null && cell !== undefined ? cell : ''}</td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${data.length > 11 ? `<p style="padding: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">Hiển thị 10/${data.length} hàng</p>` : ''}
    `;
}

function renderText(text, pageNumber) {
    if (!text || text.trim().length === 0) return '';

    return `
        <div class="card">
            <div class="card-header">
                <div class="card-title">
                    <i class="fas fa-file-alt" style="color: var(--warning);"></i>
                    Nội dung văn bản
                </div>
                <div class="card-actions">
                    <button class="btn-small btn-copy" onclick="copyText(\`${text.replace(/`/g, '\\`')}\`)">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                </div>
            </div>
            <div class="text-content">
${text}
            </div>
            <div class="table-footer">
                <span>${text.length} ký tự</span>
                <span>${text.split(/\s+/).length} từ</span>
            </div>
        </div>
    `;
}

function updateStats() {
    if (!appData) {
        document.getElementById('totalPages').textContent = '0';
        document.getElementById('totalImages').textContent = '0';
        document.getElementById('totalTables').textContent = '0';
        document.getElementById('documentStats').textContent = 'Chọn extraction để xem';
        return;
    }

    document.getElementById('totalPages').textContent = appData.totalPages || 0;
    document.getElementById('totalImages').textContent = appData.totalImages || 0;
    document.getElementById('totalTables').textContent = appData.totalTables || 0;
    document.getElementById('documentStats').textContent =
        `${appData.totalPages} trang • ${appData.totalImages} ảnh • ${appData.totalTables} bảng`;
}

function scrollToPage(pageIndex) {
    const pageElement = document.getElementById(`page-${appData.pages[pageIndex].pageNumber}`);
    if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

        document.querySelectorAll('.page-item').forEach((item, index) => {
            item.classList.toggle('active', index === pageIndex);
        });
    }
}

function openLightbox(url, filename) {
    currentLightboxImage = { url, filename };
    document.getElementById('lightboxImage').src = url;
    document.getElementById('lightboxFilename').textContent = filename;
    document.getElementById('lightbox').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('lightbox').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function downloadCurrentImage() {
    downloadFile(currentLightboxImage.url, currentLightboxImage.filename);
}

function downloadFile(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target.closest('button');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Đã copy!';
        btn.style.background = 'var(--success)';

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Không thể copy');
    });
}


async function runProcessing(id) {
    if (!confirm('Bắt đầu xử lý file PDF này?')) return;

    // Find item and update UI optimistically
    const item = allExtractions.find(e => e.id === id);
    if (item) {
        item.status = 1; // Processing
        renderTreeSidebar(); // Update UI
    }

    try {
        const response = await fetch(`/api/process-pdf/${id}`, { method: 'POST' });
        const res = await response.json();

        if (res.success) {
            // Success: Reload lists
            await loadAllExtractions(); // Will fetch new status (2) and stats
            // Auto open the newly processed item
            if (!currentExtraction) {
                await loadExtractionData(id);
            }
        } else {
            alert('Lỗi: ' + (res.error || 'Unknown Error'));
            await loadAllExtractions(); // Revert
        }
    } catch (e) {
        console.error(e);
        alert('Lỗi kết nối server');
        await loadAllExtractions();
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeLightbox();
        if (historyPanel.style.display === 'flex') {
            toggleHistory();
        }
    }
});

console.log('PDF Extract Viewer ready! (Node.js + Express backend with History)');
