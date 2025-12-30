// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const processing = document.getElementById('processing');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const processingText = document.getElementById('processingText');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
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

    dropzone.addEventListener('click', () => {
        fileInput.click();
    });
}

function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
}

async function handleFile(file) {
    // Validate file
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

        // Upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 50; // 0-50% for upload
                updateProgress(percent);
                processingText.textContent = `Đang upload... ${Math.round(percent * 2)}%`;
            }
        });

        // Upload complete
        xhr.addEventListener('load', async () => {
            if (xhr.status === 200) {
                updateProgress(50);
                processingText.textContent = 'Đang xử lý file ZIP...';

                const response = JSON.parse(xhr.responseText);

                if (response.success) {
                    // Simulate processing progress
                    for (let i = 50; i <= 100; i += 10) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        updateProgress(i);
                    }

                    setTimeout(() => {
                        showSuccess(response);
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
    successMessage.style.display = 'none';
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
    successMessage.style.display = 'none';
    errorMessage.style.display = 'block';
    document.getElementById('errorText').textContent = message;
}

function showSuccess(response) {
    processing.style.display = 'none';
    dropzone.style.display = 'none';
    errorMessage.style.display = 'none';
    successMessage.style.display = 'block';

    const stats = `${response.data.totalPages} trang, ${response.data.totalImages} ảnh, ${response.data.totalTables} bảng`;
    document.getElementById('successText').textContent = `File đã được xử lý thành công! ${stats}`;
}

function resetUpload() {
    dropzone.style.display = 'block';
    processing.style.display = 'none';
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
    fileInput.value = '';
}

console.log('PDF Extract Viewer - Upload page ready!');
