// Global state
let allExtractions = [];
let currentExtraction = null;
let currentPage = null;
let currentLightboxImage = { url: '', filename: '' };

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadAllExtractions();
    setupSidebarToggle();
});

function setupSidebarToggle() {
    const btn = document.getElementById('toggleSidebar');

    // Load state from local storage
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        document.body.classList.add('sidebar-collapsed');
    }

    if (btn) {
        btn.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-collapsed');
            localStorage.setItem('sidebarCollapsed', document.body.classList.contains('sidebar-collapsed'));
        });
    }
}

// Load all extractions from server
async function loadAllExtractions() {
    try {
        const response = await fetch('/api/extractions');
        const data = await response.json();

        if (data.success) {
            allExtractions = data.extractions;
            renderExtractionTree();
            updateGlobalStats();
        }
    } catch (error) {
        console.error('Error loading extractions:', error);
        document.getElementById('sidebarContent').innerHTML =
            '<p class="error">Lỗi tải dữ liệu</p>';
    }
}

// Render extraction tree in sidebar
function renderExtractionTree() {
    const sidebarContent = document.getElementById('sidebarContent');
    const extractionCount = document.getElementById('extractionCount');

    if (allExtractions.length === 0) {
        sidebarContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>Chưa có extraction nào</p>
                <a href="/upload.html" class="btn-small btn-primary">
                    <i class="fas fa-upload"></i> Upload ZIP
                </a>
            </div>
        `;
        extractionCount.textContent = '0';
        return;
    }

    extractionCount.textContent = allExtractions.length;

    sidebarContent.innerHTML = allExtractions.map(extraction => {
        const isActive = currentExtraction === extraction.id;
        const formatDate = (dateStr) => {
            const date = new Date(dateStr);
            return date.toLocaleString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        return `
            <div class="extraction-item ${isActive ? 'active' : ''}" id="extraction-${extraction.id}">
                <div class="extraction-header" onclick="toggleExtraction('${extraction.id}')">
                    <i class="fas ${isActive ? 'fa-folder-open' : 'fa-folder'}"></i>
                    <div class="extraction-info">
                        <div class="extraction-name" title="${extraction.name}">${extraction.name}</div>
                        <div class="extraction-meta">
                            <small><i class="fas fa-clock"></i> ${formatDate(extraction.created)}</small>
                        </div>
                        <div class="extraction-stats">
                            <span><i class="fas fa-file"></i> ${extraction.totalPages}</span>
                            <span><i class="fas fa-image"></i> ${extraction.totalImages}</span>
                            <span><i class="fas fa-table"></i> ${extraction.totalTables}</span>
                        </div>
                    </div>
                    <button class="btn-delete-small" onclick="event.stopPropagation(); deleteExtraction('${extraction.id}')" title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="extraction-pages" id="pages-${extraction.id}" style="display: ${isActive ? 'block' : 'none'};">
                    ${isActive ? '<p class="loading-small">Đang tải pages...</p>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Toggle extraction (expand/collapse)
async function toggleExtraction(extractionId) {
    if (currentExtraction === extractionId) {
        // Collapse
        currentExtraction = null;
        currentPage = null;
        showWelcomeMessage();
        renderExtractionTree();
    } else {
        // Expand and load
        currentExtraction = extractionId;
        renderExtractionTree(); // Show loading state first
        await loadExtractionPages(extractionId); // Then load actual pages (this will update the DOM directly)
    }
}

// Load pages for an extraction
async function loadExtractionPages(extractionId) {
    try {
        const response = await fetch(`/api/extraction/${extractionId}`);
        const data = await response.json();

        if (data.success) {
            const pagesContainer = document.getElementById(`pages-${extractionId}`);

            if (data.data.pages.length === 0) {
                pagesContainer.innerHTML = '<p class="empty-small">Không có page nào</p>';
                return;
            }

            pagesContainer.innerHTML = data.data.pages.map((page, index) => `
                <div class="page-item-tree ${currentPage === page.pageNumber ? 'active' : ''}" 
                     onclick="loadPageContent('${extractionId}', ${page.pageNumber}, ${index})">
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

            // Auto-load first page
            if (data.data.pages.length > 0) {
                await loadPageContent(extractionId, data.data.pages[0].pageNumber, 0);
            }
        }
    } catch (error) {
        console.error('Error loading pages:', error);
    }
}

// Load content for a specific page
async function loadPageContent(extractionId, pageNumber, pageIndex) {
    try {
        currentPage = pageNumber;

        const response = await fetch(`/api/extraction/${extractionId}`);
        const data = await response.json();

        if (data.success) {
            const page = data.data.pages[pageIndex];
            const extractPath = data.extractPath;

            renderPageContent(page, extractPath);
            updateGlobalStats();

            // Update active state in sidebar after render
            document.querySelectorAll('.page-item-tree').forEach((item, idx) => {
                if (idx === pageIndex) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        }
    } catch (error) {
        console.error('Error loading page content:', error);
    }
}

// Render page content in main area
function renderPageContent(page, extractPath) {
    const contentArea = document.getElementById('view-pdf-content'); // Target Tab 1
    if (!contentArea) {
        console.warn('Target content area "view-pdf-content" not found. Page content cannot be rendered.');
        return;
    }
    const pdfUrl = page.pdfFile ? `/uploads/${extractPath}/${page.pdfFile.path}` : null;

    contentArea.innerHTML = `
        <div class="split-view-container ${pdfUrl ? 'has-pdf' : ''}">
            <div class="result-panel">
                <div class="page-content">
                    <div class="page-header">
                        <div style="display:flex; align-items:center; gap: 15px;">
                            <div class="page-number-large">${page.pageNumber}</div>
                            <div>
                                <h2>Page ${page.pageNumber}</h2>
                                <p class="page-meta">
                                    ${page.stats.images} ảnh • ${page.stats.tables} bảng • ${page.stats.textLength} ký tự
                                </p>
                            </div>
                        </div>
                    </div>

                    ${renderImages(page.images, extractPath)}
                    ${renderTables(page.tables, extractPath)}
                    ${console.log('Page object:', page) || ''}
                    ${renderText(page.text, extractPath, page.textFile)}
                </div>
            </div>
            ${pdfUrl ? `
            <div class="pdf-panel">
                <div class="pdf-header">
                    <h3><i class="fas fa-file-pdf"></i> PDF Gốc</h3>
                    <a href="${pdfUrl}" target="_blank" class="btn-small btn-view">
                        <i class="fas fa-external-link-alt"></i> Mở tab mới
                    </a>
                </div>
                <iframe src="${pdfUrl}" class="pdf-viewer" title="PDF Viewer"></iframe>
            </div>
            ` : ''}
        </div>
    `;

    // Initialize Sortable
    initSortable();
}

function initSortable() {
    const el = document.getElementById('sortable-text-lines');
    if (el && typeof Sortable !== 'undefined') {
        new Sortable(el, {
            animation: 150,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost'
        });
    }
}

async function saveTextContent(extractId, textFile, btnElement) {
    if (!textFile) {
        alert('Không tìm thấy file text gốc để lưu');
        return;
    }

    // Visual feedback - Loading
    const originalHTML = btnElement.innerHTML;
    btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
    btnElement.disabled = true;

    const container = document.getElementById('sortable-text-lines');
    const lines = [];
    container.querySelectorAll('.line-content').forEach(div => {
        lines.push(div.innerText);
    });

    const newContent = lines.join('\n');

    try {
        const response = await fetch('/api/save-text', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                extractId,
                filePath: textFile.path,
                content: newContent
            })
        });

        const data = await response.json();
        if (data.success) {
            btnElement.innerHTML = '<i class="fas fa-check"></i> Đã Lưu';
            btnElement.style.background = 'var(--success)';
            setTimeout(() => {
                btnElement.innerHTML = originalHTML;
                btnElement.style.background = '';
                btnElement.disabled = false;
            }, 2000);
        } else {
            alert('Lỗi khi lưu: ' + data.error);
            btnElement.innerHTML = originalHTML;
            btnElement.disabled = false;
        }
    } catch (error) {
        console.error('Error saving:', error);
        alert('Lỗi kết nối khi lưu');
        btnElement.innerHTML = originalHTML;
        btnElement.disabled = false;
    }
}

// Render images
function renderImages(images, extractPath) {
    if (!images || images.length === 0) return '';

    // Determine the actual folder path from the first image
    let imageFolder = 'images';
    if (images.length > 0) {
        // img.path is like "folder/subfolder/image.png"
        const firstPath = images[0].path;
        if (firstPath.includes('/')) {
            imageFolder = firstPath.substring(0, firstPath.lastIndexOf('/'));
        }
    }

    return `
        <div class="content-section">
            <h3 class="section-toggle" onclick="toggleSection('images-section')">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-images"></i> Hình ảnh (${images.length})
                </div>
                <div class="section-actions" onclick="event.stopPropagation()" style="display: flex; gap: 5px; margin-right: auto; margin-left: 15px;">
                    <button class="btn-icon-small" onclick="downloadFolder('/api/download-folder?extractPath=${extractPath}&folderName=${encodeURIComponent(imageFolder)}')" title="Download All Images (Zip)">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn-icon-small" onclick="triggerMultiUpload('${extractPath}', '${imageFolder}')" title="Upload Multiple Images">
                        <i class="fas fa-upload"></i>
                    </button>
                </div>
                <i class="fas fa-chevron-down toggle-icon"></i>
            </h3>
            <div class="collapsible-content" id="images-section" style="display: none; flex-wrap: wrap; gap: 8px;">
                ${images.map(img => `
                    <div class="groupable-item type-image" style="cursor: zoom-in; display: flex; flex-direction: column; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; background: #fff;" onclick="openLightbox('/uploads/${extractPath}/${img.path}', '${img.filename}')">
                        <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 5px; min-height: 100px;">
                            <img src="/uploads/${extractPath}/${img.path}" alt="${img.filename}" loading="lazy" style="max-width: 100%; max-height: 100px; object-fit: contain;">
                        </div>
                        <div class="image-label" style="display:flex; justify-content:space-between; align-items:center; background:#34495e; padding:6px 8px; color:#fff; border-top: 1px solid #2c3e50;">
                            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.75rem; margin-right:5px; font-weight: 500;" title="${img.filename}">${img.filename}</span>
                            <div onclick="event.stopPropagation()" style="display:flex; gap:8px;">
                                <button class="btn-icon-small" style="color:#ecf0f1; padding:0; background:none; border:none; cursor:pointer;" onclick="downloadFile('/uploads/${extractPath}/${img.path}', '${img.filename}')" title="Download">
                                    <i class="fas fa-download" style="font-size:0.9em;"></i>
                                </button>
                                <button class="btn-icon-small" style="color:#ecf0f1; padding:0; background:none; border:none; cursor:pointer;" onclick="triggerFileUpload('${extractPath}', '${img.path}', '${img.filename}')" title="Replace">
                                    <i class="fas fa-upload" style="font-size:0.9em;"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Helper: Download Folder (Zip)
function downloadFolder(url) {
    window.location.href = url;
}

// Trigger hidden file input for MULTIPLE files
function triggerMultiUpload(extractPath, folderName) {
    // Create or get hidden input
    let input = document.getElementById('globalMultiFileInput');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.multiple = true; // Allow multiple
        input.id = 'globalMultiFileInput';
        input.style.display = 'none';
        document.body.appendChild(input);
    }

    // Set callback on change
    input.onchange = async (e) => {
        if (e.target.files.length > 0) {
            await uploadMultipleFiles(extractPath, folderName, e.target.files);
        }
        input.value = ''; // Reset
    };

    input.click();
}

// Upload multiple files
async function uploadMultipleFiles(extractPath, folderName, files) {
    if (!confirm(`Bạn có chắc muốn upload ${files.length} file vào thư mục "${folderName}"?`)) return;

    let successCount = 0;
    let errorCount = 0;

    // Iterate and upload one by one (reuse existing API for simplicity)
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();

        // Append text fields FIRST for Multer compatibility
        formData.append('extractPath', extractPath);

        const relativePath = `${folderName}/${file.name}`;
        formData.append('relativePath', relativePath);

        // Append file LAST
        formData.append('file', file);

        try {
            const response = await fetch('/api/overwrite-file', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.success) successCount++;
            else errorCount++;
        } catch (e) {
            console.error(e);
            errorCount++;
        }
    }

    alert(`Upload hoàn tất: ${successCount} thành công, ${errorCount} lỗi. Vui lòng reload trang.`);
}

// Trigger hidden file input (Single)
function triggerFileUpload(extractPath, filePath, filename) {
    // Create or get hidden input
    let input = document.getElementById('globalFileInput');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'globalFileInput';
        input.style.display = 'none';
        document.body.appendChild(input);
    }

    // Set callback on change
    input.onchange = async (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            await uploadFile(extractPath, filePath, file);
        }
        input.value = ''; // Reset
    };

    input.click();
}

// Upload file to replace existing
async function uploadFile(extractPath, relativePath, file) {
    if (!confirm(`Bạn có chắc muốn ghi đè file "${file.name}" lên file cũ?`)) return;

    const formData = new FormData();
    formData.append('extractPath', extractPath);
    formData.append('relativePath', relativePath);
    formData.append('file', file);

    try {
        const response = await fetch('/api/overwrite-file', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            alert('Upload thành công! Vui lòng reload lại trang hoặc mở lại mục này để thấy thay đổi.');
        } else {
            alert('Lỗi upload: ' + data.error);
        }
    } catch (error) {
        console.error('Error uploading:', error);
        alert('Lỗi kết nối khi upload');
    }
}

// Render tables
function renderTables(tables, extractPath) {
    if (!tables || tables.length === 0) return '';

    // Calculate Table Folder
    let tableFolder = 'Tables';
    if (tables.length > 0) {
        const firstPath = tables[0].path;
        if (firstPath.includes('/')) {
            tableFolder = firstPath.substring(0, firstPath.lastIndexOf('/'));
        }
    }

    return `
        <div class="content-section">
            <h3 class="section-toggle" onclick="toggleSection('tables-section')">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-table"></i> Bảng (${tables.length})
                </div>
                <div class="section-actions" onclick="event.stopPropagation()" style="display: flex; gap: 5px; margin-right: auto; margin-left: 15px;">
                    <button class="btn-icon-small" onclick="downloadFolder('/api/download-folder?extractPath=${extractPath}&folderName=${encodeURIComponent(tableFolder)}')" title="Download All Tables (Zip)">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn-icon-small" onclick="triggerMultiUpload('${extractPath}', '${tableFolder}')" title="Upload Multiple Tables">
                        <i class="fas fa-upload"></i>
                    </button>
                </div>
                <i class="fas fa-chevron-down toggle-icon"></i>
            </h3>
            <div class="collapsible-content" id="tables-section" style="display: none;">
                ${tables.map(table => `
                    <div class="table-card">
                        <div class="table-card-header">
                            <span><i class="fas fa-file-excel"></i> ${table.filename}</span>
                            <div class="table-actions">
                                <button class="btn-small btn-view" onclick="loadTable('${extractPath}', '${table.path}', '${table.filename}')">
                                    <i class="fas fa-eye"></i> Xem
                                </button>
                                <button class="btn-small btn-download" onclick="downloadFile('/uploads/${extractPath}/${table.path}', '${table.filename}')">
                                    <i class="fas fa-download"></i> Tải
                                </button>
                                <button class="btn-small btn-primary" onclick="triggerFileUpload('${extractPath}', '${table.path}', '${table.filename}')" title="Upload đè file">
                                    <i class="fas fa-upload"></i> Up
                                </button>
                            </div>
                        </div>
                        <div id="table-${table.filename}" class="table-content">
                            <p class="table-placeholder">Click "Xem" để load bảng</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Copy path modal logic
function copyToClipboard(text) {
    const modal = document.getElementById('copyPathModal');
    const input = document.getElementById('networkPathInput');
    const msg = document.getElementById('copySuccessMsg');

    input.value = text;
    msg.style.display = 'none';
    modal.style.display = 'flex';

    // Auto select text
    setTimeout(() => {
        input.select();
        input.setSelectionRange(0, 99999); // For mobile devices
    }, 100);
}

function closeCopyModal() {
    document.getElementById('copyPathModal').style.display = 'none';
}

function executeCopy() {
    const input = document.getElementById('networkPathInput');
    input.select();
    input.setSelectionRange(0, 99999);

    // Allow secure context copy or fallback (since this is called from user action button click)
    // Try classic execCommand first as it works broadly in this context
    let success = false;
    try {
        success = document.execCommand('copy');
    } catch (err) {
        success = false;
    }

    if (!success && navigator.clipboard) {
        navigator.clipboard.writeText(input.value).then(() => {
            showCopySuccess();
        });
    } else if (success) {
        showCopySuccess();
    } else {
        alert('Không thể tự động copy. Vui lòng nhấn Ctrl+C');
    }
}

function showCopySuccess() {
    const msg = document.getElementById('copySuccessMsg');
    msg.style.display = 'block';

    // Close modal after delay
    setTimeout(() => {
        closeCopyModal();
    }, 1500);
}

// Load table content
async function loadTable(extractPath, tablePath, filename) {
    try {
        const container = document.getElementById(`table-${filename}`);
        container.innerHTML = '<p class="table-placeholder"><i class="fas fa-spinner fa-spin"></i> Đang tải dữ liệu bảng...</p>';

        // Add timestamp to prevent caching
        const response = await fetch(`/api/excel-render/${extractPath}/${tablePath}?t=${new Date().getTime()}`);
        const data = await response.json();

        // Calculate Network Path (UNC) manually or get from server CONFIG
        // Assuming Server IP is static usually or document.location.hostname works if strictly LAN
        const serverIP = window.location.hostname; // e.g. 192.168.1.242 
        // Need to convert url path to windows path separator
        // tablePath is like "myfolder/file.xlsx"
        // Network share name is "uploads" (User configured)
        // Full path: \\192.168.1.242\uploads\<extractPath>\<tablePath>

        // Note: extractPath and tablePath came from URL, so forward slashes. Win needs backslashes.
        const winExtractPath = extractPath.replace(/\//g, '\\');
        const winTablePath = tablePath.replace(/\//g, '\\');
        const networkPath = `\\\\${serverIP}\\uploads\\${winExtractPath}\\${winTablePath}`;

        // Fetch Cloud Config from Server
        let oneDriveRootPath = "/personal/69551be368fd8730/Documents/uploads"; // Fallback
        try {
            const configRes = await fetch('/api/config');
            const config = await configRes.json();
            if (config.oneDrive && config.oneDrive.rootPath) {
                oneDriveRootPath = config.oneDrive.rootPath;
            }
        } catch (e) {
            console.warn('Could not fetch cloud config, using default');
        }

        // Construct Path to the FOLDER containing the Excel file (Parent Folder)
        // tablePath is like "2/Tables/file.xlsx". We remove the filename.
        const fullTablePath = `${extractPath}/${tablePath}`;
        // Get parent directory by removing everything after the last slash
        const parentFolderPath = fullTablePath.substring(0, fullTablePath.lastIndexOf('/'));

        // Full Folder Path (Raw)
        // e.g., /personal/.../uploads/mybinder_.../2/Tables
        const rawFullFolderPath = `${oneDriveRootPath}/${parentFolderPath}`;

        // Encode URL components matches OneDrive pattern
        let encodedId = encodeURIComponent(rawFullFolderPath);
        encodedId = encodedId.replace(/_/g, '%5F').replace(/-/g, '%2D');

        // URL Construction
        // pattern: https://onedrive.live.com/?id=[encoded_id]&cid=69551be368fd8730
        const oneDriveLink = `https://onedrive.live.com/?id=${encodedId}`;

        if (data.success) {
            container.innerHTML = `
                <div class="excel-preview-container">
                    ${data.html}
                </div>
                <div class="table-footer">
                    <span>Sheet: ${data.sheetName} • ${data.rowCount} dòng x ${data.columnCount} cột</span>
                    <div class="action-buttons">
                        <a href="${oneDriveLink}" target="_blank" class="btn-small btn-secondary open-onedrive-btn" style="text-decoration: none; background-color: #0078D4;" title="Mở thư mục chứa file trên OneDrive">
                            <i class="fas fa-folder-open"></i> Edit Online
                        </a>
                        <button class="btn-small btn-secondary" onclick="copyToClipboard('${networkPath.replace(/\\/g, '\\\\')}')" title="Sao chép đường dẫn mạng để sửa file">
                            <i class="fas fa-edit"></i> Sửa file (LAN)
                        </button>
                        <button class="btn-small btn-download" onclick="downloadFile('/uploads/${extractPath}/${tablePath}', '${filename}')">
                            <i class="fas fa-download"></i> Tải Excel
                        </button>
                         <button class="btn-small btn-primary" onclick="triggerFileUpload('${extractPath}', '${tablePath}', '${filename}')">
                            <i class="fas fa-upload"></i> Up
                        </button>
                    </div>
                </div>
                <!-- Hidden trigger for PNG generation (Disabled) -->
                <!-- <img src="/api/excel-png/${extractPath}/${tablePath}" style="display: none;" onerror="console.log('PNG generation triggered in background')" /> -->
            `;
        } else {
            container.innerHTML = `<p class="table-placeholder error">Lỗi: ${data.error}</p>`;
        }
    } catch (error) {
        console.error('Error loading table:', error);
        const container = document.getElementById(`table-${filename}`);
        container.innerHTML = '<p class="table-placeholder error">Lỗi tải bảng</p>';
    }
}

// Render table HTML
function renderTableHTML(data) {
    if (!data || data.length === 0) return '<p class="table-placeholder">Không có dữ liệu</p>';

    const headers = data[0];
    const rows = data.slice(1, 11);

    return `
        <div class="table-container">
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
        </div>
        ${data.length > 11 ? `<p class="table-note">Hiển thị 10/${data.length} hàng</p>` : ''}
    `;
}

// Render text content
function renderText(text, extractPath, textFile) {
    if (!text || text.trim().length === 0) return '';

    const lines = text.split(/\r?\n/);
    const textFileParam = textFile ? JSON.stringify(textFile).replace(/"/g, '&quot;') : 'null';

    // Calculate Text Folder
    let textFolder = 'text';
    if (textFile && textFile.path && textFile.path.includes('/')) {
        textFolder = textFile.path.substring(0, textFile.path.lastIndexOf('/'));
    }

    return `
        <div class="content-section">
            <h3 class="section-toggle" onclick="toggleSection('text-section')">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-file-alt"></i> Nội dung văn bản
                </div>
                <div class="section-actions" onclick="event.stopPropagation()" style="display: flex; gap: 5px; margin-right: auto; margin-left: 15px;">
                    <button class="btn-icon-small" onclick="downloadFolder('/api/download-folder?extractPath=${extractPath}&folderName=${encodeURIComponent(textFolder)}')" title="Download All Text Files (Zip)">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn-icon-small" onclick="triggerMultiUpload('${extractPath}', '${textFolder}')" title="Upload Multiple Text Files">
                        <i class="fas fa-upload"></i>
                    </button>
                </div>
                <i class="fas fa-chevron-down toggle-icon"></i>
            </h3>
            <div class="collapsible-content" id="text-section" style="display: none;">
                <div class="text-card">
                    <div class="text-toolbar">
                        <span class="text-hint"><i class="fas fa-info-circle"></i> Kéo thả để sắp xếp lại dòng. Click vào dòng để sửa.</span>
                        <div class="text-actions">
                            <button class="btn-small btn-primary" onclick="saveTextContent('${extractPath}', ${textFileParam}, this)">
                                <i class="fas fa-save"></i> Lưu Thay Đổi
                            </button>
                            ${textFile ? `
                            <button class="btn-small btn-secondary" onclick="triggerFileUpload('${extractPath}', '${textFile.path}', '${textFile.filename}')" title="Upload đè file text này">
                                <i class="fas fa-upload"></i> Up
                            </button>
                            <button class="btn-small btn-download" onclick="downloadFile('/uploads/${extractPath}/${textFile.path}', '${textFile.filename}')" title="Download text gốc">
                                <i class="fas fa-download"></i> Down
                            </button>
                            ` : ''}
                            <button class="btn-small btn-copy" onclick="copyText(\`${text.replace(/`/g, '\\`')}\`)">
                                <i class="fas fa-copy"></i> Copy All
                            </button>
                        </div>
                    </div>
                    <div id="sortable-text-lines" class="sortable-lines-container">
                        ${lines.map((line, index) => `
                            <div class="draggable-line" data-index="${index}">
                                <div class="drag-handle"><i class="fas fa-grip-lines"></i></div>
                                <div class="line-content" contenteditable="true">${line}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="text-footer">
                        <span>${text.length} ký tự • ${lines.length} dòng</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Show welcome message
function showWelcomeMessage() {
    document.getElementById('contentArea').innerHTML = `
        <div class="welcome-message">
            <i class="fas fa-hand-pointer"></i>
            <h2>Chọn một extraction từ sidebar</h2>
            <p>Click vào một extraction bên trái để xem nội dung chi tiết</p>
        </div>
    `;
}

// Delete extraction
async function deleteExtraction(id) {
    if (!confirm('Bạn có chắc muốn xóa extraction này?')) return;

    try {
        const response = await fetch(`/api/extraction/${id}`, { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            // Remove from list
            allExtractions = allExtractions.filter(e => e.id !== id);

            // If currently viewing, clear it
            if (currentExtraction === id) {
                currentExtraction = null;
                currentPage = null;
                showWelcomeMessage();
            }

            // Re-render
            renderExtractionTree();
            updateGlobalStats();
        }
    } catch (error) {
        alert('Lỗi xóa extraction');
    }
}

// Update global statistics
function updateGlobalStats() {
    const totalPages = allExtractions.reduce((sum, e) => sum + e.totalPages, 0);
    const totalImages = allExtractions.reduce((sum, e) => sum + e.totalImages, 0);
    const totalTables = allExtractions.reduce((sum, e) => sum + e.totalTables, 0);

    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('totalImages').textContent = totalImages;
    document.getElementById('totalTables').textContent = totalTables;
}

// Lightbox functions
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

// Utility functions
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

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeLightbox();
    }
});

// Toggle section visibility
function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    const toggle = event.currentTarget.querySelector('.toggle-icon');

    if (section.style.display === 'none') {
        // Use flex for images-section (Hybrid Grid), block for others
        section.style.display = sectionId === 'images-section' ? 'flex' : 'block';
        toggle.style.transform = 'rotate(180deg)';
    } else {
        section.style.display = 'none';
        toggle.style.transform = 'rotate(0deg)';
    }
}

console.log('PDF Extract Viewer - Home page ready!');

