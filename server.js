require('dotenv').config();
const https = require('https');
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8081;

// Cache Configuration for Excel Rendering
const CACHE_DIR = path.join('uploads', '.cache');
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.get('/test-crop-image', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'test-crop.html'));
});

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

// Configuration for OneDrive (or other cloud storage)
// Users should update 'rootPath' to match their actual OneDrive folder path visible in the web URL 'id' parameter
// Example: '/personal/YOUR_CID/Documents/uploads' or 'root' depending on setup
const CLOUD_CONFIG = {
    oneDrive: {
        rootPath: process.env.ONEDRIVE_ROOT_PATH || '/personal/69551be368fd8730/Documents/uploads',
        tenantId: process.env.ONEDRIVE_TENANT_ID,
        clientId: process.env.ONEDRIVE_CLIENT_ID,
        clientSecret: process.env.ONEDRIVE_CLIENT_SECRET,
        enabled: true
    }
};

// API: Get App Config
app.get('/api/config', (req, res) => {
    res.json(CLOUD_CONFIG);
});

const uploadPdf = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() === '.pdf') {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file .pdf'));
        }
    }
});

const uploadAny = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// API: Upload PDF and init workspace
app.post('/api/upload', uploadPdf.single('pdfFile'), async (req, res) => {
    console.log('Received PDF upload request');
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }

        const tempPath = req.file.path;
        const originalName = req.file.originalname; // e.g. "MyDoc.pdf"
        const pdfBaseName = path.basename(originalName, '.pdf'); // "MyDoc"

        // Sanitize filename
        const sanitizedName = pdfBaseName.replace(/[^a-zA-Z0-9_\-]/g, '_');
        // Create Folder: Name + Timestamp
        const timestamp = Date.now();
        const extractFolderName = `${sanitizedName}_${timestamp}`;
        const extractPath = path.join('uploads', extractFolderName);
        const extractId = extractFolderName;

        // Create directory
        if (!fs.existsSync(extractPath)) {
            fs.mkdirSync(extractPath, { recursive: true });
        }

        // Move the uploaded PDF to the new folder
        const targetPdfPath = path.join(extractPath, originalName);
        fs.renameSync(tempPath, targetPdfPath);

        // Initial Result (Unprocessed)
        const result = {
            totalPages: 0,
            totalImages: 0,
            totalTables: 0,
            totalPdfs: 1,
            pdfFiles: [originalName],
            pages: [],
            status: 0
        };

        // Save to history with STATUS 0 (Unprocessed)
        const historyEntry = {
            id: extractId,
            filename: originalName,
            uploadDate: new Date().toISOString(),
            size: req.file.size,
            totalPages: 0,
            totalImages: 0,
            totalTables: 0,
            totalPdfs: 1,
            status: 0 // 0 = New/Unprocessed
        };
        saveToHistory(historyEntry);

        res.json({
            success: true,
            data: result,
            extractPath: extractId,
            historyEntry
        });

    } catch (error) {
        console.error('Error processing upload:', error);
        // Try to cleanup temp file if exists
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) { }
        }
        res.status(500).json({ error: error.message });
    }
});

// API: Get upload history
app.get('/api/history', (req, res) => {
    try {
        const history = loadHistory();
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Get all extractions with status
app.get('/api/extractions', async (req, res) => {
    try {
        const uploadsDir = 'uploads';
        const items = fs.readdirSync(uploadsDir);
        const history = loadHistory(); // Load history to get status
        const extractions = [];

        for (const item of items) {
            const itemPath = path.join(uploadsDir, item);
            // Skip non-directories and special files
            if (!fs.statSync(itemPath).isDirectory() || item.startsWith('.')) {
                continue;
            }

            // Check if it's an extraction folder
            if (item.startsWith('extract-') || /_\d{13}$/.test(item)) {
                try {
                    const stats = fs.statSync(itemPath);
                    const historyItem = history.find(h => h.id === item);

                    // Default values if not in history
                    let status = 2; // Default to Done for old folders
                    let totalPages = 0, totalImages = 0, totalTables = 0;

                    if (historyItem) {
                        status = historyItem.status !== undefined ? historyItem.status : 2;
                        totalPages = historyItem.totalPages || 0;
                        totalImages = historyItem.totalImages || 0;
                        totalTables = historyItem.totalTables || 0;
                    } else {
                        // For old folders not in history, we scan them
                        // const result = await processExtractedFiles(itemPath);
                        // totalPages = result.totalPages;
                        // totalImages = result.totalImages;
                        // totalTables = result.totalTables;
                        // For performance, maybe skip deep scan on list? 
                        // Let's rely on history for speed, just basic info if missing
                    }

                    extractions.push({
                        id: item,
                        name: historyItem ? (historyItem.displayName || historyItem.filename) : item,
                        created: stats.birthtime || stats.mtime,
                        totalPages,
                        totalImages,
                        totalTables,
                        status // 0=New, 1=Processing, 2=Done
                    });
                } catch (error) {
                    console.error(`Error processing info ${item}:`, error);
                }
            }
        }

        // Sort by creation time, newest first
        extractions.sort((a, b) => new Date(b.created) - new Date(a.created));

        res.json({ success: true, extractions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Core Processing Function (Separated for Cron Job & API usage)
async function runExtractionProcess(id, isAuto = false) {
    const logPrefix = isAuto ? '[Cron]' : '[API]';
    console.log(`${logPrefix} Starting processing for: ${id}`);

    // 1. Load History & Validate
    const history = loadHistory();
    const entryIndex = history.findIndex(h => h.id === id);

    if (entryIndex === -1) {
        return { success: false, error: 'Extraction not found in history' };
    }

    const extractPath = path.join(__dirname, 'uploads', id);
    const lockFile = path.join(extractPath, 'lock.txt');

    // 2. Check Lock
    if (fs.existsSync(lockFile)) {
        return { success: false, error: 'Process is currently locked/running' };
    }

    let pdfFilename = history[entryIndex].filename;
    let pdfFullPath = path.join(extractPath, pdfFilename);

    if (!fs.existsSync(pdfFullPath)) {
        return { success: false, error: `PDF file not found: ${pdfFilename}` };
    }

    // Auto-Rename (Safe Name) Logic
    if (pdfFilename !== 'source.pdf') {
        const safeName = 'source.pdf';
        const safeFullPath = path.join(extractPath, safeName);
        try {
            fs.renameSync(pdfFullPath, safeFullPath);
            console.log(`[Core] Renamed '${pdfFilename}' -> '${safeName}'`);

            if (!history[entryIndex].displayName) history[entryIndex].displayName = pdfFilename;
            history[entryIndex].filename = safeName;
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

            pdfFilename = safeName;
            pdfFullPath = safeFullPath;
        } catch (e) {
            console.error('Rename error:', e);
            return { success: false, error: 'Rename failed: ' + e.message };
        }
    }

    try {
        // 3. Create Lock
        fs.writeFileSync(lockFile, new Date().toISOString());

        // 4. Update Status -> 1 (Processing)
        history[entryIndex].status = 1;
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

        // 5. Spawn Process
        const batFile = path.join(__dirname, 'ExtractAllTool.bat');
        console.log(`${logPrefix} Executing: ${batFile} "${pdfFullPath}"`);

        const child = spawn(batFile, [pdfFullPath], {
            cwd: __dirname,
            shell: true
        });

        child.stdout.on('data', (data) => console.log(`[CMD ${id}]: ${data}`));
        child.stderr.on('data', (data) => console.error(`[CMD ERROR ${id}]: ${data}`));

        child.on('close', async (code) => {
            console.log(`${logPrefix} Process ${id} finished with code ${code}`);

            if (fs.existsSync(lockFile)) {
                try { fs.unlinkSync(lockFile); } catch (e) { console.error('Error removing lock:', e); }
            }

            let isSuccess = (code === 0);

            try {
                const pdfBaseName = path.basename(pdfFilename, '.pdf');
                const statusTxtPath = path.join(extractPath, pdfBaseName, 'status.txt');

                if (fs.existsSync(statusTxtPath)) {
                    const statusContent = fs.readFileSync(statusTxtPath, 'utf8').trim();
                    if (statusContent === '2') isSuccess = true;
                }
            } catch (err) { console.error('Error checking status.txt:', err); }

            const currentHistory = loadHistory();
            const idx = currentHistory.findIndex(h => h.id === id);

            if (idx !== -1) {
                if (isSuccess) {
                    currentHistory[idx].status = 2;
                    try {
                        const result = await processExtractedFiles(extractPath);
                        currentHistory[idx].totalPages = result.totalPages;
                        currentHistory[idx].totalImages = result.totalImages;
                        currentHistory[idx].totalTables = result.totalTables;
                        currentHistory[idx].totalPdfs = result.totalPdfs;
                    } catch (scanError) { console.error('Error rescanning:', scanError); }
                } else {
                    currentHistory[idx].status = 3;
                    console.error(`${logPrefix} Task failed for ${id}`);
                }
                fs.writeFileSync(HISTORY_FILE, JSON.stringify(currentHistory, null, 2));
            }
        });

        return { success: true, message: 'Started in background' };

    } catch (error) {
        console.error('Processing Exception:', error);
        try { if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile); } catch (e) { }
        return { success: false, error: error.message };
    }
}

// API: Trigger Processing for PDF
app.post('/api/process-pdf/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`Triggering processing for: ${id}`);

    try {
        const history = loadHistory();
        const entryIndex = history.findIndex(h => h.id === id);

        if (entryIndex === -1) {
            return res.status(404).json({ error: 'Extraction not found in history' });
        }

        const extractPath = path.join(__dirname, 'uploads', id);
        const lockFile = path.join(extractPath, 'lock.txt');

        // Check if locked
        if (fs.existsSync(lockFile)) {
            return res.status(409).json({ error: 'Đang xử lý (Locked)' });
        }

        // Find PDF file path based on history filename
        const pdfFilename = history[entryIndex].filename;
        const pdfFullPath = path.join(extractPath, pdfFilename);

        if (!fs.existsSync(pdfFullPath)) {
            return res.status(404).json({ error: `File PDF không tồn tại: ${pdfFilename}` });
        }

        // 1. Create Lock File
        fs.writeFileSync(lockFile, new Date().toISOString());

        // 2. Update status to 1 (Processing)
        history[entryIndex].status = 1;
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

        // 3. Execute Batch File
        const batFile = path.join(__dirname, 'ExtractAllTool.bat');
        console.log(`Executing: ${batFile} "${pdfFullPath}"`);

        // Spawn process detached so it continues even if request closes? 
        // No, standard spawn is fine, we just return response early.
        const child = spawn(batFile, [pdfFullPath], {
            cwd: __dirname,
            shell: true
        });

        // Log output (Optional: store in log file in folder?)
        child.stdout.on('data', (data) => console.log(`[CMD ${id}]: ${data}`));
        child.stderr.on('data', (data) => console.error(`[CMD ERROR ${id}]: ${data}`));

        child.on('close', async (code) => {
            console.log(`Process ${id} finished with code ${code}`);

            // Remove Lock
            if (fs.existsSync(lockFile)) {
                try { fs.unlinkSync(lockFile); } catch (e) { console.error('Error removing lock:', e); }
            }

            // Determine Success: Exit Code 0 AND/OR status.txt = 2
            let isSuccess = (code === 0);

            try {
                const pdfBaseName = path.basename(pdfFilename, '.pdf');
                const statusTxtPath = path.join(extractPath, pdfBaseName, 'status.txt');

                if (fs.existsSync(statusTxtPath)) {
                    const statusContent = fs.readFileSync(statusTxtPath, 'utf8').trim();
                    if (statusContent === '2') {
                        isSuccess = true;
                    }
                }
            } catch (err) {
                console.error('Error checking status.txt:', err);
            }

            // Update Status
            const currentHistory = loadHistory();
            const idx = currentHistory.findIndex(h => h.id === id);

            if (idx !== -1) {
                if (isSuccess) {
                    // Success
                    currentHistory[idx].status = 2;

                    // Rescan folder to get actual stats (images, tables generated)
                    try {
                        const result = await processExtractedFiles(extractPath);
                        currentHistory[idx].totalPages = result.totalPages;
                        currentHistory[idx].totalImages = result.totalImages;
                        currentHistory[idx].totalTables = result.totalTables;
                        currentHistory[idx].totalPdfs = result.totalPdfs;
                    } catch (scanError) {
                        console.error('Error rescanning folder stats:', scanError);
                    }
                } else {
                    // Failure
                    console.error(`Process failed with code ${code}`);
                    currentHistory[idx].status = 3; // 3 = Error
                }

                fs.writeFileSync(HISTORY_FILE, JSON.stringify(currentHistory, null, 2));
            }
        });

        // Return immediately to Client implies "Processing Started"
        res.json({ success: true, message: 'Processing started in background', status: 1 });

    } catch (error) {
        console.error('Processing start error:', error);
        // Try cleanup lock
        try {
            const extractPath = path.join('uploads', id);
            if (fs.existsSync(path.join(extractPath, 'lock.txt'))) fs.unlinkSync(path.join(extractPath, 'lock.txt'));
        } catch (e) { }

        res.status(500).json({ error: error.message });
    }
});

// API: Get specific extraction by ID
app.get('/api/extraction/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const extractPath = path.join('uploads', id);

        if (!fs.existsSync(extractPath)) {
            return res.status(404).json({ error: 'Extraction không tồn tại' });
        }

        const result = await processExtractedFiles(extractPath);
        // Load groups if exist
        let savedGroups = [];
        const groupsFile = path.join(extractPath, 'groups.json');
        if (fs.existsSync(groupsFile)) {
            try {
                savedGroups = JSON.parse(fs.readFileSync(groupsFile, 'utf-8'));
            } catch (e) { console.error('Error reading groups.json', e); }
        }

        // Attach groups to result
        result.groups = savedGroups;

        res.json({ success: true, data: result, extractPath: id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Save groups
app.post('/api/save-groups', (req, res) => {
    try {
        const { extractPath, groups } = req.body;
        if (!extractPath || !groups) return res.status(400).json({ error: 'Missing data' });

        const fullPath = path.join('uploads', extractPath, 'groups.json');
        fs.writeFileSync(fullPath, JSON.stringify(groups, null, 2), 'utf-8');

        res.json({ success: true });
    } catch (error) {
        console.error('Error saving groups:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Delete extraction
app.delete('/api/extraction/:id', (req, res) => {
    try {
        const { id } = req.params;
        const extractPath = path.join('uploads', id);

        if (fs.existsSync(extractPath)) {
            fs.rmSync(extractPath, { recursive: true, force: true });
        }

        removeFromHistory(id);
        res.json({ success: true, message: 'Đã xóa extraction' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API: Delete specific file
app.post('/api/delete-file', express.json(), (req, res) => {
    try {
        const { extractId, filePath } = req.body;
        if (!extractId || !filePath) return res.status(400).json({ error: 'Missing parameters' });

        const fullPath = path.join(__dirname, 'uploads', extractId, filePath);

        // Security check: ensure path is within uploads
        const relative = path.relative(path.join(__dirname, 'uploads'), fullPath);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                res.json({ success: true, message: 'Đã xóa file' });
            } else {
                res.status(404).json({ error: 'File not found' });
            }
        } else {
            res.status(403).json({ error: 'Unauthorized path' });
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Delete specific folder (Category)
app.post('/api/delete-folder', express.json(), (req, res) => {
    try {
        const { extractId, folderName } = req.body;
        if (!extractId || !folderName) return res.status(400).json({ error: 'Missing parameters' });

        const fullPath = path.join(__dirname, 'uploads', extractId, folderName);

        // Security check
        const relative = path.relative(path.join(__dirname, 'uploads'), fullPath);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
            if (fs.existsSync(fullPath)) {
                fs.rmSync(fullPath, { recursive: true, force: true });
                // Recreate the empty folder to keep structure
                fs.mkdirSync(fullPath, { recursive: true });
                res.json({ success: true, message: 'Đã xóa nội dung thư mục' });
            } else {
                res.status(404).json({ error: 'Folder not found' });
            }
        } else {
            res.status(403).json({ error: 'Unauthorized path' });
        }
    } catch (error) {
        console.error('Error deleting folder:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Get file content - using regex for flexible path matching
app.get(/^\/api\/file\/([^\/]+)\/(.+)$/, (req, res) => {
    try {
        const extractPath = req.params[0];
        const filePath = req.params[1];
        const fullPath = path.join('uploads', extractPath, filePath);

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'File không tồn tại' });
        }

        const ext = path.extname(fullPath).toLowerCase();

        if (ext === '.txt') {
            const content = fs.readFileSync(fullPath, 'utf-8');
            res.json({ content });
        } else if (ext === '.xlsx') {
            const workbook = XLSX.readFile(fullPath);
            const sheets = workbook.SheetNames.map(name => ({
                name,
                data: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 })
            }));
            res.json({ sheets });
        } else {
            res.sendFile(path.resolve(fullPath));
        }
    } catch (error) {
        console.error('Error reading file:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Save text file content
app.post('/api/save-text', async (req, res) => {
    try {
        const { extractId, filePath, content } = req.body;

        if (!extractId || !filePath || content === undefined) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const fullPath = path.join('uploads', extractId, filePath);

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        fs.writeFileSync(fullPath, content, 'utf-8');
        res.json({ success: true, message: 'File saved successfully' });
    } catch (error) {
        console.error('Error saving text file:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Overwrite existing file with uploaded file
app.post('/api/overwrite-file', (req, res, next) => {
    uploadAny.single('file')(req, res, (err) => {
        if (err) {
            console.error('Multer error:', err);
            return res.status(400).json({ error: 'File upload error: ' + err.message });
        }
        next();
    });
}, (req, res) => {
    try {
        console.log('Received overwrite request. Body:', req.body);
        console.log('File:', req.file ? req.file.originalname : 'None');

        const { extractPath, relativePath } = req.body;
        const uploadedFile = req.file;

        if (!uploadedFile) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        if (!extractPath || !relativePath) {
            return res.status(400).json({ error: 'Missing extractPath or relativePath' });
        }

        const targetPath = path.join('uploads', extractPath, relativePath);

        // Security check
        const allowedRoot = path.join('uploads', extractPath);
        if (!targetPath.startsWith(allowedRoot)) {
            console.error('Security check failed:', targetPath, allowedRoot);
            return res.status(403).json({ error: 'Invalid path security violation' });
        }

        // Ensure directory exists
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
            console.log('Creating directory:', targetDir);
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Check if uploaded file is a ZIP
        if (path.extname(uploadedFile.originalname).toLowerCase() === '.zip') {
            console.log('Detected ZIP upload. Extracting to:', targetDir);
            const zip = new AdmZip(uploadedFile.path);
            zip.extractAllTo(targetDir, true /* overwrite */);
            console.log('Extraction complete.');
        } else {
            // Normal file: Move/Copy the uploaded file to the target path
            fs.copyFileSync(uploadedFile.path, targetPath);
            console.log('File written to:', targetPath);
        }

        // Try to unlink temp file, ignore if fails (sometimes locked or auto-cleaned)
        try {
            fs.unlinkSync(uploadedFile.path);
        } catch (unlinkErr) {
            console.warn('Could not unlink temp file:', unlinkErr.message);
        }

        res.json({ success: true, message: 'File uploaded/extracted successfully' });
    } catch (error) {
        console.error('Error overwriting file log:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// API: Render Excel with styling using ExcelJS
app.get(/^\/api\/excel-render\/([^\/]+)\/(.+)$/, async (req, res) => {
    try {
        const extractPath = req.params[0];
        const filePath = req.params[1];
        const fullPath = path.join('uploads', extractPath, filePath);

        const stats = fs.statSync(fullPath);
        const cacheKey = crypto.createHash('md5').update(`${fullPath}_${stats.mtimeMs}`).digest('hex');
        const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);

        // Check if cache exists
        if (fs.existsSync(cacheFile)) {
            try {
                const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
                console.log(`[Cache Hit] Serving Excel: ${filePath}`);
                return res.json({
                    success: true,
                    ...cachedData,
                    fromCache: true
                });
            } catch (e) {
                console.error('Error reading cache file:', e);
                // Continue to render if cache is broken
            }
        }

        console.log(`[Cache Miss] Rendering Excel: ${filePath}`);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(fullPath);

        const worksheet = workbook.worksheets[0]; // Get first sheet

        // Calculate relative base path for images
        let relativeBase = '';
        const parts = filePath.split('/');
        if (parts.length > 0) {
            parts.pop();
            if (parts.length > 0 && parts[parts.length - 1].toLowerCase() === 'tables') {
                parts.pop();
            }
            relativeBase = parts.join('/');
        }

        const htmlTable = convertWorksheetToStyledHTML(worksheet, extractPath, relativeBase);

        const resultData = {
            html: htmlTable,
            sheetName: worksheet.name,
            rowCount: worksheet.rowCount,
            columnCount: worksheet.columnCount
        };

        // Save to cache asynchronously to not block response
        fs.writeFile(cacheFile, JSON.stringify(resultData), (err) => {
            if (err) console.error('Error saving cache file:', err);
            else console.log(`[Cache Saved] ${filePath}`);
        });

        res.json({
            success: true,
            ...resultData
        });
    } catch (error) {
        console.error('Error rendering Excel:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Download folder as ZIP
app.get('/api/download-folder', async (req, res) => {
    try {
        const { extractPath, folderName } = req.query; // folderName: 'images', 'tables', or relative path

        if (!extractPath || !folderName) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const folderPath = path.join('uploads', extractPath, folderName);

        if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        const zip = new AdmZip();
        zip.addLocalFolder(folderPath); // Add all files in folder to zip root

        const zipBuffer = zip.toBuffer();
        const downloadName = `${folderName}_${Date.now()}.zip`;

        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename=${downloadName}`);
        res.set('Content-Length', zipBuffer.length);
        res.send(zipBuffer);

    } catch (error) {
        console.error('Error downloading folder:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Convert Excel to PNG and serve image
app.get(/^\/api\/excel-png\/([^\/]+)\/(.+)$/, async (req, res) => {
    try {
        const extractPath = req.params[0];
        const filePath = req.params[1];
        const fullPath = path.join('uploads', extractPath, filePath);

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'File không tồn tại' });
        }

        // Convert Excel to PNG
        const pngPath = await convertExcelToPNG(fullPath);

        if (pngPath && fs.existsSync(pngPath)) {
            // Serve PNG image
            res.sendFile(path.resolve(pngPath));
        } else {
            res.status(500).json({ error: 'Không thể convert Excel sang PNG' });
        }
    } catch (error) {
        console.error('Error serving Excel PNG:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to convert Excel worksheet to styled HTML
function convertWorksheetToStyledHTML(worksheet, extractPath, relativeBase) {
    let html = '<div class="excel-wrapper" style="position: relative; display: inline-block;"><!-- DEBUG_VER_2 -->';
    html += '<table class="excel-styled-table">';

    // Get actual row count (including empty rows)
    // Updated row count logic to include images
    let maxRow = worksheet.rowCount || 50;
    if (worksheet.getImages && worksheet.getImages().length > 0) {
        worksheet.getImages().forEach(img => {
            // nativeRow is 0-indexed
            if (img.range.br.nativeRow + 1 > maxRow) maxRow = img.range.br.nativeRow + 1;
        });
    }
    const rowCount = maxRow;
    const colCount = worksheet.actualColumnCount || worksheet.columnCount || 20;

    console.log(`Rendering Excel: ${rowCount} rows × ${colCount} columns`);

    // Pre-process merged cells
    // Map to store master cells: string("row,col") -> { rowspan, colspan, borders }
    const mergeMasters = new Map();
    // Set to store skipped cells: string("row,col")
    const skippedCells = new Set();

    // Get merges from either direct property or model (ExcelJS structure)
    let rawMerges = worksheet.merges;
    if ((!rawMerges || (typeof rawMerges === 'object' && Object.keys(rawMerges).length === 0)) && worksheet.model && worksheet.model.merges) {
        rawMerges = worksheet.model.merges;
    }

    if (rawMerges) {
        const mergeList = [];
        if (Array.isArray(rawMerges)) {
            mergeList.push(...rawMerges);
        } else if (typeof rawMerges === 'object') {
            mergeList.push(...Object.keys(rawMerges));
        }

        mergeList.forEach(rangeStr => {
            // Range format: "A1:B2" or just "A1" (rare for merge)
            if (!rangeStr || !rangeStr.includes(':')) return;

            // Simple parsing to find corners without heavy dependency
            const [startStr, endStr] = rangeStr.split(':');

            // We must use worksheet to parse address to get numbers
            // If worksheet.getCell is expensive, we can use regex, but getCell is reliable
            const tl = worksheet.getCell(startStr);
            const br = worksheet.getCell(endStr);

            const top = tl.row;
            const left = tl.col;
            const bottom = br.row;
            const right = br.col;

            const rowspan = bottom - top + 1;
            const colspan = right - left + 1;

            if (rowspan > 1 || colspan > 1) {
                // Collect borders from all cells in the merge range
                // Border can be stored in any cell of the merged range
                const mergedBorders = {
                    top: null,
                    bottom: null,
                    left: null,
                    right: null
                };

                // Check all cells in the merge range for borders
                for (let r = top; r <= bottom; r++) {
                    for (let c = left; c <= right; c++) {
                        const checkCell = worksheet.getRow(r).getCell(c);
                        if (checkCell.border) {
                            // Top border: check cells in top row
                            if (r === top && checkCell.border.top && !mergedBorders.top) {
                                mergedBorders.top = checkCell.border.top;
                            }
                            // Bottom border: check cells in bottom row
                            if (r === bottom && checkCell.border.bottom && !mergedBorders.bottom) {
                                mergedBorders.bottom = checkCell.border.bottom;
                            }
                            // Left border: check cells in left column
                            if (c === left && checkCell.border.left && !mergedBorders.left) {
                                mergedBorders.left = checkCell.border.left;
                            }
                            // Right border: check cells in right column
                            if (c === right && checkCell.border.right && !mergedBorders.right) {
                                mergedBorders.right = checkCell.border.right;
                            }
                        }
                    }
                }

                mergeMasters.set(`${top},${left}`, {
                    rowspan,
                    colspan,
                    borders: mergedBorders
                });

                // Mark all other cells as skipped
                for (let r = top; r <= bottom; r++) {
                    for (let c = left; c <= right; c++) {
                        if (r === top && c === left) continue; // Skip master
                        skippedCells.add(`${r},${c}`);
                    }
                }
            }
        });
    }

    // Iterate through ALL rows (including empty ones)
    for (let rowNum = 1; rowNum <= rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        html += '<tr>';

        // Iterate through all columns
        for (let colNum = 1; colNum <= colCount; colNum++) {
            const cell = row.getCell(colNum);

            // Check for merged cells using robust ExcelJS properties
            if (cell.isMerged) {
                // If this is NOT the master cell, skip rendering
                if (cell.master.address !== cell.address) {
                    continue;
                }
            }

            const value = (cell.value !== null && cell.value !== undefined) ? cell.value : '';
            let displayValue = formatCellValue(cell);

            // Handle Image Placeholders
            if (extractPath && typeof displayValue === 'string') {
                // Match both <image.png/> and &lt;image.png/&gt; - supports any 3-4 letter extension (e.g. pgn typo)
                const imgMatch = displayValue.match(/(?:<|&lt;)([^>]+?\.[a-zA-Z0-9]{3,4})(?:[\s\/]*(?:>|&gt;))/i);

                if (imgMatch) {
                    let imgFilename = path.basename(imgMatch[1]);

                    // Fix common typos    

                    const prefix = relativeBase ? `${relativeBase}/` : '';
                    const imgSrc = `/uploads/${extractPath}/${prefix}images/${imgFilename}`;

                    console.log(`Debug Excel Image Path: ${imgSrc}`);

                    // Adjusted size for better table aesthetics - Increased limits to show full image
                    displayValue = `<img src="${imgSrc}" style="max-width: 300px; max-height: 250px; object-fit: contain; display: block; margin: 0 auto;" alt="${imgFilename}" />`;
                }
            }

            // Calculate colspan/rowspan for Master merged cells
            let spanAttrs = '';
            let isMergedCell = false;
            let mergedCellInfo = null;

            // Use the pre-calculated merge masters
            const masterKey = `${cell.row},${cell.col}`;
            if (mergeMasters.has(masterKey)) {
                const dims = mergeMasters.get(masterKey);
                if (dims.rowspan > 1) spanAttrs += ` rowspan="${dims.rowspan}"`;
                if (dims.colspan > 1) spanAttrs += ` colspan="${dims.colspan}"`;
                // If cell has rowspan OR colspan, it's merged
                isMergedCell = true;
                mergedCellInfo = dims;
            } else if (cell.isMerged) {
                // Fallback: check ExcelJS property
                isMergedCell = true;
            }

            const style = getCellStyle(cell, isMergedCell, mergedCellInfo);
            html += `<td style="${style}"${spanAttrs}>${displayValue}</td>`;
        }

        html += '</tr>';
    }

    html += '</table>';

    // Extract and render images
    if (worksheet.getImages && worksheet.getImages().length > 0) {
        const images = worksheet.getImages();
        console.log(`Found ${images.length} images in worksheet`);

        images.forEach(img => {
            try {
                const imageId = img.imageId;
                const image = worksheet.workbook.model.media.find(m => m.index === imageId);

                if (image && image.buffer) {
                    const base64 = image.buffer.toString('base64');
                    const ext = image.extension || 'png';
                    const dataUrl = `data:image/${ext};base64,${base64}`;

                    // Calculate position from cell range
                    const range = img.range;
                    const topRow = range.tl.nativeRow;
                    const leftCol = range.tl.nativeCol;

                    // Estimate position (rough calculation)
                    // Note: This is an approximation. Improved by increasing max limits.
                    const top = topRow * 25; // Approximate row height
                    const left = leftCol * 80; // Approximate column width

                    html += `<img src="${dataUrl}" style="position: absolute; top: ${top}px; left: ${left}px; max-width: 500px; max-height: 400px; object-fit: contain; z-index: 5;" />`;
                }
            } catch (e) {
                console.error('Error rendering image:', e);
            }
        });
    }

    html += '</div>';
    return html;
}

// Get cell styling from ExcelJS cell
function getCellStyle(cell, isMergedCell = false, mergedCellInfo = null) {
    let styles = [];

    // Helper: Calculate luminance
    const getLuminance = (hex) => {
        if (!hex || hex.length !== 6) return 255; // Default white
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b);
    };

    let bgHex = 'FFFFFF'; // Default background

    // Background color
    if (cell.fill && cell.fill.fgColor) {
        if (cell.fill.fgColor.argb) {
            bgHex = cell.fill.fgColor.argb.substring(2);
            styles.push(`background-color: #${bgHex}`);
        } else {
            // Theme color mapping could go here, but defaulting to White is valid fallback
        }
    }

    // Font
    if (cell.font) {
        if (cell.font.bold) styles.push('font-weight: bold');
        if (cell.font.italic) styles.push('font-style: italic');
        if (cell.font.size) {
            // Scale up font size for web readability (add 3pt)
            const scaledSize = cell.font.size + 3;
            styles.push(`font-size: ${scaledSize}pt`);
        }

        let fontHex = '000000'; // Default font
        if (cell.font.color) {
            if (cell.font.color.argb) {
                fontHex = cell.font.color.argb.substring(2);
            }
            // If theme used for font, we assume it contrasts well usually,
            // but if we defaulted BG to white and Theme is White... check later?
            // Since we don't know theme color, we can't check contrast accurately.
            // But if ARGB is present (the reported case), this logic applies.
        }

        // SMART COLOR CORRECTION
        // If contrast is too low (e.g. White on White), force contrast.
        const bgLum = getLuminance(bgHex);
        const fontLum = getLuminance(fontHex);

        if (Math.abs(bgLum - fontLum) < 50) {
            // Contrast too low -> Force Black or Whtie
            fontHex = bgLum > 128 ? '000000' : 'FFFFFF';
        }

        if (cell.font.color || fontHex !== '000000') {
            // Only add style if explicit or corrected
            styles.push(`color: #${fontHex}`);
        }

        if (cell.font.name) styles.push(`font-family: '${cell.font.name}'`);
    }

    // Alignment
    let hasExplicitAlignment = false;
    if (cell.alignment) {
        if (cell.alignment.horizontal) {
            hasExplicitAlignment = true;
            let align = cell.alignment.horizontal;
            // Map Excel-specific alignments to CSS
            if (align === 'centerContinuous') align = 'center';
            if (align === 'distributed') align = 'justify';
            styles.push(`text-align: ${align}`);
        }
        if (cell.alignment.vertical) {
            let valign = cell.alignment.vertical;
            if (valign === 'center') valign = 'middle';
            styles.push(`vertical-align: ${valign}`);
        }

        // Text Rotation
        if (cell.alignment.textRotation) {
            if (cell.alignment.textRotation === 'vertical') {
                styles.push('writing-mode: vertical-rl');
                styles.push('text-orientation: upright');
            } else if (typeof cell.alignment.textRotation === 'number') {
                // Excel: 90 is bottom-to-top, -90 is top-to-bottom
                if (cell.alignment.textRotation === 90) {
                    styles.push('writing-mode: vertical-rl');
                    styles.push('transform: rotate(180deg)');
                } else if (cell.alignment.textRotation === -90 || cell.alignment.textRotation === 270) {
                    styles.push('writing-mode: vertical-rl');
                } else {
                    // For other angles, use transform
                    styles.push(`transform: rotate(${-cell.alignment.textRotation}deg)`);
                    styles.push('display: inline-block');
                }
            }
        }
    }

    // Default alignment for merged cells if not explicitly set
    if (isMergedCell && !hasExplicitAlignment) {
        styles.push('text-align: center');
        styles.push('vertical-align: middle');
    }

    // Borders - use merged cell borders if available
    const mapBorder = (side) => {
        if (!side) return null;

        // Map Excel styles to CSS width/style
        let style = 'solid';
        let width = '1px';

        switch (side.style) {
            case 'thin': width = '1px'; break;
            case 'medium': width = '2px'; break;
            case 'thick': width = '3px'; break;
            case 'double': width = '3px'; style = 'double'; break;
            case 'dotted': style = 'dotted'; break;
            case 'dashed': style = 'dashed'; break;
            case 'hair': width = '1px'; style = 'solid'; break; // Approximate
            default: width = '1px';
        }

        // Map color
        let color = '#000000';
        if (side.color && side.color.argb && side.color.argb.length >= 2) {
            color = '#' + side.color.argb.substring(2);
        }

        return `${width} ${style} ${color}`;
    };

    // Determine which border to use: merged cell borders or cell borders
    let borderSource = null;
    if (isMergedCell && mergedCellInfo && mergedCellInfo.borders) {
        // Use borders collected from all cells in merge range
        borderSource = mergedCellInfo.borders;
    } else if (cell.border) {
        // Use cell's own border
        borderSource = cell.border;
    }

    if (borderSource) {
        if (borderSource.top) styles.push(`border-top: ${mapBorder(borderSource.top)}`);
        if (borderSource.bottom) styles.push(`border-bottom: ${mapBorder(borderSource.bottom)}`);
        if (borderSource.left) styles.push(`border-left: ${mapBorder(borderSource.left)}`);
        if (borderSource.right) styles.push(`border-right: ${mapBorder(borderSource.right)}`);
    }

    // Padding
    styles.push('padding: 4px 8px');

    // White-space handling: only wrap if wrapText is true in Excel
    if (cell.alignment && cell.alignment.wrapText) {
        styles.push('white-space: normal');
    } else {
        styles.push('white-space: nowrap');
    }

    return styles.join('; ');
}

// Format cell value for display
function formatCellValue(cell) {
    if (!cell || cell.value === null || cell.value === undefined) return '';

    let textStr = '';
    const value = cell.value;

    // Priority 1: If it's a number, we format it ourselves to ensure the comma (2,547)
    // and ignore cell.text which might be unformatted "2547" or formatted incorrectly as "2.547"
    if (typeof value === 'number') {
        textStr = value.toLocaleString('en-US');
    }
    // Priority 2: Use cell.text for other types (strings, formatted results)
    else if (cell.text !== undefined && cell.text !== null && cell.text !== '' && !cell.formula) {
        textStr = cell.text;
    }
    else {
        // Fallback logic for specialized types
        // Handle Rich Text (array of text objects)
        if (typeof value === 'object' && value.richText) {
            textStr = value.richText.map(t => t.text).join('');
        }
        // Handle formula results
        else if (typeof value === 'object' && value.result !== undefined) {
            // Recurse with just the result value
            return formatCellValue({ value: value.result });
        }
        // Handle dates
        else if (value instanceof Date) {
            textStr = value.toLocaleDateString('en-US');
        }
        // Handle objects (fallback)
        else if (typeof value === 'object') {
            if (value.text) textStr = String(value.text);
            else if (value.result !== undefined) textStr = String(value.result);
        }
        else {
            textStr = String(value);
        }
    }

    // If still empty but has value
    if (textStr === '' && cell.value !== '') {
        textStr = String(cell.value);
    }

    // Common escaping and formatting
    let str = textStr.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return str.replace(/\r?\n/g, '<br>');
}

// Convert Excel to PNG screenshot
async function convertExcelToPNG(excelPath) {
    try {
        const pngPath = excelPath.replace('.xlsx', '.png').replace('.xls', '.png');

        // Check if PNG already exists
        if (fs.existsSync(pngPath)) {
            console.log(`PNG already exists: ${pngPath}`);
            return pngPath;
        }

        console.log(`Converting Excel to PNG: ${excelPath}`);

        // Read Excel and generate HTML
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(excelPath);
        const worksheet = workbook.worksheets[0];
        const htmlTable = convertWorksheetToStyledHTML(worksheet);

        // Create full HTML page
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        margin: 0;
                        padding: 20px;
                        background: white;
                        font-family: 'Calibri', 'Arial', sans-serif;
                    }
                    .excel-styled-table {
                        border-collapse: collapse;
                        font-size: 11pt;
                    }
                    .excel-styled-table td {
                        border: 1px solid #d0d0d0;
                        min-width: 60px;
                    }
                </style>
            </head>
            <body>
                ${htmlTable}
            </body>
            </html>
        `;

        // Launch Puppeteer and screenshot
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setContent(htmlContent);

        // Get dimensions from wrapper to include absolute images
        const dimensions = await page.evaluate(() => {
            const wrapper = document.querySelector('.excel-wrapper');
            if (!wrapper) {
                const table = document.querySelector('.excel-styled-table');
                return {
                    width: table ? table.offsetWidth + 40 : 800,
                    height: table ? table.offsetHeight + 40 : 600
                };
            }

            // Calculate max extent including absolute positioned images
            let width = wrapper.offsetWidth;
            let height = wrapper.offsetHeight;

            const imgs = wrapper.querySelectorAll('img');
            imgs.forEach(img => {
                const right = img.offsetLeft + img.offsetWidth;
                const bottom = img.offsetTop + img.offsetHeight;
                if (right > width) width = right;
                if (bottom > height) height = bottom;
            });

            return {
                width: width + 40,
                height: height + 40
            };
        });

        // Set viewport to fit content fully
        await page.setViewport({
            width: Math.ceil(dimensions.width),
            height: Math.ceil(dimensions.height),
            deviceScaleFactor: 2 // Higher resolution
        });

        // Take screenshot
        await page.screenshot({
            path: pngPath,
            fullPage: true
        });

        await browser.close();

        console.log(`Excel converted to PNG: ${pngPath}`);
        return pngPath;

    } catch (error) {
        console.error('Error converting Excel to PNG:', error);
        return null;
    }
}

// History management
const HISTORY_FILE = path.join('uploads', 'history.json');

function loadHistory() {
    if (!fs.existsSync(HISTORY_FILE)) {
        return [];
    }
    const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
}

function saveToHistory(entry) {
    const history = loadHistory();
    history.unshift(entry); // Add to beginning
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function removeFromHistory(id) {
    const history = loadHistory();
    const filtered = history.filter(h => h.id !== id);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(filtered, null, 2));
}

// Process extracted files - flexible structure support
async function processExtractedFiles(extractPath) {
    const pages = [];

    // Check if there's a nested folder (like mybinder_20251219130130 or Report 2024)
    let actualPath = extractPath;
    const items = fs.readdirSync(extractPath);

    // Get all directories in the extract path
    const directories = items.filter(item => {
        const itemPath = path.join(extractPath, item);
        return fs.statSync(itemPath).isDirectory();
    });

    // If there's exactly one directory, check if it contains page folders
    if (directories.length === 1) {
        const nestedPath = path.join(extractPath, directories[0]);
        const nestedItems = fs.readdirSync(nestedPath);

        // Check if nested folder contains page folders
        const hasPageFolders = nestedItems.some(item => {
            const itemPath = path.join(nestedPath, item);
            try {
                return fs.statSync(itemPath).isDirectory() &&
                    (/^\d+$/.test(item) || item.startsWith('page_'));
            } catch (e) {
                return false;
            }
        });

        if (hasPageFolders) {
            actualPath = nestedPath;
            console.log(`Using nested path: ${nestedPath}`);
        }
    }

    const allItems = fs.readdirSync(actualPath);

    // Find page folders - support both 'page_N' and just 'N' formats
    const pageFolders = allItems
        .filter(item => {
            const itemPath = path.join(actualPath, item);
            if (!fs.statSync(itemPath).isDirectory()) return false;
            // Match 'page_1', 'page_01', or just '1', '01'
            return /^(page_)?\d+$/.test(item);
        })
        .sort((a, b) => {
            const numA = parseInt(a.replace('page_', ''));
            const numB = parseInt(b.replace('page_', ''));
            return numA - numB;
        });

    for (const folder of pageFolders) {
        const pageNum = parseInt(folder.replace('page_', ''));
        const folderPath = path.join(actualPath, folder);

        const pageData = {
            pageNumber: pageNum,
            images: [],
            tables: [],
            text: '',
            pdfFile: null,
            stats: {
                images: 0,
                tables: 0,
                textLength: 0
            }
        };

        // Process images - look in images/unzipped/word/media
        const folderContents = fs.readdirSync(folderPath);
        const imagesFolderName = folderContents.find(f => f.toLowerCase() === 'images');

        console.log(`Processing Page ${pageNum} in ${folderPath}`);

        if (imagesFolderName) {
            const imagesPath = path.join(folderPath, imagesFolderName);
            if (fs.statSync(imagesPath).isDirectory()) {
                console.log(`Found images folder: ${imagesPath}`);

                // Helper to get all files recursively
                const getFilesRecursively = (dir) => {
                    let results = [];
                    const list = fs.readdirSync(dir);
                    list.forEach(file => {
                        file = path.join(dir, file);
                        const stat = fs.statSync(file);
                        if (stat && stat.isDirectory()) {
                            results = results.concat(getFilesRecursively(file));
                        } else {
                            results.push(file);
                        }
                    });
                    return results;
                }

                const allFilesFullPaths = getFilesRecursively(imagesPath);
                // Filter images
                const imageFilesFullPaths = allFilesFullPaths.filter(f => {
                    const ext = path.extname(f).toLowerCase();
                    return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.wmf', '.emf', '.tiff', '.tif'].includes(ext);
                });

                console.log(`Recursive scan found ${imageFilesFullPaths.length} images`);

                const relativePath = actualPath === extractPath ? folder : `${path.basename(actualPath)}/${folder}`;

                // Sort images explicitly by filename (A-Z)
                imageFilesFullPaths.sort((a, b) => {
                    return path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' });
                });

                pageData.images = imageFilesFullPaths.map(fullPath => {
                    // Create relative path from 'imagesPath' to file
                    // We need path relative to 'images' folder to append to existing structure
                    // But actually the frontend needs path relative to 'extraction root'

                    // fullPath: E:\...\1\images\sub\foo.png
                    // folderPath: E:\...\1
                    // imagesPath: E:\...\1\images

                    // We want: 1/images/sub/foo.png

                    const rel = path.relative(folderPath, fullPath).replace(/\\/g, '/');
                    return {
                        filename: path.basename(fullPath),
                        path: `${relativePath}/${rel}`
                    };
                });

                pageData.stats.images = imageFilesFullPaths.length;
                console.log(`Page ${pageNum}: Found ${imageFilesFullPaths.length} images`);
            }
        }

        // Process tables - case insensitive
        const tablesFolderName = folderContents.find(f => f.toLowerCase() === 'tables');
        if (tablesFolderName) {
            const tablesPath = path.join(folderPath, tablesFolderName);
            if (fs.statSync(tablesPath).isDirectory()) {

                // Helper to get all files recursively (reuse logic if scoped, or redefine)
                const getFilesRecursively = (dir) => {
                    let results = [];
                    const list = fs.readdirSync(dir);
                    list.forEach(file => {
                        file = path.join(dir, file);
                        const stat = fs.statSync(file);
                        if (stat && stat.isDirectory()) {
                            results = results.concat(getFilesRecursively(file));
                        } else {
                            results.push(file);
                        }
                    });
                    return results;
                }

                const allFilesFullPaths = getFilesRecursively(tablesPath);
                const tableFilesFullPaths = allFilesFullPaths.filter(f => f.toLowerCase().endsWith('.xlsx'));

                console.log(`Page ${pageNum}: Found ${tableFilesFullPaths.length} tables recursively in ${tablesPath}`);

                const relativePath = actualPath === extractPath ? folder : `${path.basename(actualPath)}/${folder}`;
                pageData.tables = tableFilesFullPaths.map(fullPath => {
                    const rel = path.relative(folderPath, fullPath).replace(/\\/g, '/');
                    return {
                        filename: path.basename(fullPath),
                        path: `${relativePath}/${rel}`
                    };
                });
                pageData.stats.tables = tableFilesFullPaths.length;
            }
        }

        // Process text - try different names
        const textFiles = folderContents.filter(f => {
            const lower = f.toLowerCase();
            return lower.endsWith('.txt') || lower === 'content.txt';
        });
        if (textFiles.length > 0) {
            // Sort files to handle order deterministically
            textFiles.sort();

            pageData.text = '';

            for (const file of textFiles) {
                const textPath = path.join(folderPath, file);

                // Read file as buffer first
                try {
                    const buffer = fs.readFileSync(textPath);

                    // Detect encoding
                    const detected = jschardet.detect(buffer);
                    const encoding = detected.encoding || 'utf-8';

                    console.log(`Detected encoding for ${file}: ${encoding} (confidence: ${detected.confidence})`);

                    let fileContent = '';

                    // Convert to UTF-8 if needed
                    if (encoding.toLowerCase() === 'utf-8' || encoding.toLowerCase() === 'ascii') {
                        fileContent = buffer.toString('utf-8');
                    } else {
                        // Use iconv-lite to convert from detected encoding to UTF-8
                        try {
                            fileContent = iconv.decode(buffer, encoding);
                        } catch (e) {
                            console.error(`Error decoding with ${encoding}, falling back to utf-8:`, e.message);
                            fileContent = buffer.toString('utf-8');
                        }
                    }

                    if (pageData.text.length > 0) {
                        pageData.text += '\n\n';
                    }
                    pageData.text += fileContent;

                    // Update textFile reference to the last read file (for saving purposes)
                    // This allows edits to be saved to the last file in the list
                    const relativePath = actualPath === extractPath ? folder : `${path.basename(actualPath)}/${folder}`;
                    pageData.textFile = {
                        filename: file,
                        path: `${relativePath}/${file}`
                    };
                } catch (err) {
                    console.error(`Error reading text file ${file}:`, err);
                }
            }

            console.log(`Debug textFile for page ${pageNum}:`, pageData.textFile);
            pageData.stats.textLength = pageData.text.length;
        }

        // Process PDF
        const pdfFiles = folderContents.filter(f => f.toLowerCase().endsWith('.pdf'));
        if (pdfFiles.length > 0) {
            const relativePath = actualPath === extractPath ? folder : `${path.basename(actualPath)}/${folder}`;
            pageData.pdfFile = {
                filename: pdfFiles[0],
                path: `${relativePath}/${pdfFiles[0]}`
            };
        }

        pages.push(pageData);
    }

    const totalImages = pages.reduce((sum, p) => sum + p.stats.images, 0);
    const totalTables = pages.reduce((sum, p) => sum + p.stats.tables, 0);

    // Scan root for PDFs specifically (in case source PDF is included)
    const rootPdfs = allItems.filter(f => f.toLowerCase().endsWith('.pdf')).map(f => {
        return path.relative(extractPath, path.join(actualPath, f)).replace(/\\/g, '/');
    });

    return {
        pages,
        totalImages,
        totalTables,
        totalPages: pages.length,
        pdfFiles: rootPdfs
    };
}

// Cleanup old uploads
function cleanupOldUploads() {
    const uploadsDir = 'uploads';
    const maxAge = 24 * 60 * 60 * 1000;

    fs.readdir(uploadsDir, (err, files) => {
        if (err) return;

        files.forEach(file => {
            const filePath = path.join(uploadsDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (Date.now() - stats.mtimeMs > maxAge) {
                    if (stats.isDirectory()) {
                        fs.rmSync(filePath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(filePath);
                    }
                }
            });
        });
    });
}

// setInterval(cleanupOldUploads, 60 * 60 * 1000);

// ---------------------------------------------
// Tag Management API
// ---------------------------------------------
app.get('/api/tags', (req, res) => {
    const tagsPath = path.join(__dirname, 'tags.json');
    if (fs.existsSync(tagsPath)) {
        try {
            const tags = JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
            res.json(tags);
        } catch (e) {
            console.error('Error reading tags.json:', e);
            // Fallback to defaults
            res.json(require('./public/js/group-defines.js'));
        }
    } else {
        // Return defaults
        res.json(require('./public/js/group-defines.js'));
    }
});

app.post('/api/save-tags', express.json(), (req, res) => {
    try {
        const tags = req.body.tags;
        if (!Array.isArray(tags)) return res.status(400).json({ error: 'Invalid tags data' });

        fs.writeFileSync(path.join(__dirname, 'tags.json'), JSON.stringify(tags, null, 2));
        res.json({ success: true });
    } catch (e) {
        console.error('Error saving tags:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/save-cropped-image', express.json({ limit: '10mb' }), async (req, res) => {
    try {
        const { image, folderPath, filename } = req.body;
        if (!image || !folderPath || !filename) {
            return res.status(400).json({ error: 'Thiếu thông tin hình ảnh, thư mục hoặc tên file.' });
        }

        // image is base64 string: "data:image/png;base64,..."
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        // Target directory: e.g., uploads/test1_1767156182359/test1/1/images
        const targetDir = path.join(__dirname, folderPath);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const finalPath = path.join(targetDir, filename);
        fs.writeFileSync(finalPath, buffer);

        console.log(`✅ Cropped image saved: ${finalPath}`);
        res.json({ success: true, path: finalPath });
    } catch (e) {
        console.error('Error saving cropped image:', e);
        res.status(500).json({ error: e.message });
    }
});


const OneDriveOAuthService = require('./onedrive-oauth');

// Initialize OAuth Service
let oneDriveOAuth = null;
if (process.env.ONEDRIVE_CLIENT_ID && !process.env.ONEDRIVE_CLIENT_ID.includes('YOUR')) {
    oneDriveOAuth = new OneDriveOAuthService(
        'consumers', // Use 'consumers' for Personal accounts only
        process.env.ONEDRIVE_CLIENT_ID,
        process.env.ONEDRIVE_CLIENT_SECRET,
        process.env.ONEDRIVE_REDIRECT_URI || 'http://localhost:8081/auth/callback'
    );
    console.log('✅ OneDrive OAuth Service initialized');
}

// Auth Routes
app.get('/auth/login', async (req, res) => {
    try {
        if (!oneDriveOAuth) {
            return res.status(500).send('OneDrive not configured');
        }
        const authUrl = await oneDriveOAuth.getAuthUrl();
        res.redirect(authUrl);
    } catch (e) {
        console.error('Auth login error:', e);
        res.status(500).send('Failed to initiate login');
    }
});

app.get('/auth/callback', async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) {
            return res.status(400).send('No authorization code received');
        }

        await oneDriveOAuth.handleCallback(code);
        res.send(`
            <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2>✅ Đăng nhập thành công!</h2>
                    <p>Bạn có thể đóng tab này và quay lại ứng dụng.</p>
                    <script>
                        setTimeout(() => window.close(), 2000);
                    </script>
                </body>
            </html>
        `);
    } catch (e) {
        console.error('Auth callback error:', e);
        res.status(500).send('Authentication failed: ' + e.message);
    }
});

// API: Upload to OneDrive & Get Edit Link (OAuth)
app.post('/api/open-onedrive', async (req, res) => {
    try {
        if (!oneDriveOAuth) {
            return res.status(400).json({ error: 'OneDrive not configured' });
        }

        // Check if user is authenticated
        if (!oneDriveOAuth.isAuthenticated()) {
            return res.json({
                success: false,
                requireAuth: true,
                authUrl: '/auth/login'
            });
        }

        const { extractId, filePath } = req.body;

        // Resolve Local File
        let localFullPath;
        if (filePath) {
            localFullPath = path.join(__dirname, 'uploads', extractId, filePath);
        } else {
            const extractPath = path.join(__dirname, 'uploads', extractId);
            if (fs.existsSync(extractPath)) {
                const files = fs.readdirSync(extractPath);
                const excel = files.find(f => f.endsWith('.xlsx'));
                if (!excel) return res.status(404).json({ error: 'No Excel file found' });
                localFullPath = path.join(extractPath, excel);
            } else {
                return res.status(404).json({ error: 'Extraction path not found' });
            }
        }

        if (!fs.existsSync(localFullPath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        // Upload
        const link = await oneDriveOAuth.uploadAndGetLink(localFullPath, 'Uploads');
        res.json({ success: true, url: link });

    } catch (e) {
        console.error('OneDrive API Error:', e);
        if (e.message === 'AUTH_REQUIRED') {
            return res.json({
                success: false,
                requireAuth: true,
                authUrl: '/auth/login'
            });
        }
        res.status(500).json({ error: e.message });
    }
});

// --- CRON JOB: Auto-Scan for Unprocessed Items (Status 0 or 3) ---
console.log('✅ [Cron] Background Scheduler started: SEQUENTIAL processing (One by One)...');
setInterval(() => {
    try {
        const history = loadHistory();

        // 1. Check if system is BUSY (Any item with status 1)
        const isBusy = history.some(h => h.status === 1);
        if (isBusy) {
            // console.log('[Cron] System is busy. Waiting...');
            return;
        }

        // 2. Pick next item (Priority: Status 0 -> Status 3)
        const nextItem = history.find(h => h.status === 0 || h.status === 3);

        if (nextItem) {
            const extractPath = path.join(__dirname, 'uploads', nextItem.id);
            const lockFile = path.join(extractPath, 'lock.txt');

            // Only run if lock file does not exist (double safety)
            if (!fs.existsSync(lockFile)) {
                console.log(`[Cron] Picking next item: ${nextItem.filename} (${nextItem.id})`);
                runExtractionProcess(nextItem.id, true);
            }
        }
    } catch (e) {
        console.error('[Cron] Error in scan loop:', e);
    }
}, 10000); // Run every 10 seconds

// Start Servers (HTTP + HTTPS)
const HTTP_PORT = PORT;
const HTTPS_PORT = parseInt(PORT) + 1; // 8082

// HTTP Server (for localhost)
app.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`🚀 HTTP Server running at http://localhost:${HTTP_PORT}`);
    console.log(`🌐 Accessible via LAN at http://192.168.1.242:${HTTP_PORT}`);
});

// HTTPS Server (for LAN IP with OneDrive OAuth)
try {
    const sslOptions = {
        key: fs.readFileSync(path.join(__dirname, '192.168.1.242-key.pem')),
        cert: fs.readFileSync(path.join(__dirname, '192.168.1.242.pem'))
    };

    https.createServer(sslOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`🔒 HTTPS Server running at https://localhost:${HTTPS_PORT}`);
        console.log(`🌐 Accessible via LAN at https://192.168.1.242:${HTTPS_PORT}`);
        console.log(`⚠️  Note: You'll see SSL warning (self-signed cert). Click "Advanced" → "Proceed"`);
        console.log(`📁 Upload limit: ${uploadPdf.limits.fileSize / 1024 / 1024}MB`);
    });
} catch (e) {
    console.warn('⚠️  HTTPS Server not started (SSL cert not found). Only HTTP available.');
    console.warn('   To enable HTTPS for LAN IP OAuth, run: openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=192.168.1.24"');
}