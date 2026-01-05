// Global state for Group Logic
var groupExtractionId = null;

let sourceItems = [];
let groups = []; // stores [{ name, page, subGroups: [...] }]
let pendingSubGroups = []; // stores [{ tag, items }]
let groupedItemIds = new Set(); // Track items already in groups
let availablePages = new Set();
var selectedPage = null;
let editingGroupIndex = -1; // Track active editing group
let expandedGroupIndices = new Set(); // Track expanded groups (for master groups)
let expandedPending = true; // Track draft expansion
let renamingMasterIndex = -1; // Track which master group is being renamed
let currentExtractionData = null; // Store full API response

document.addEventListener('DOMContentLoaded', () => {
    // Parse URL params
    const urlParams = new URLSearchParams(window.location.search);
    const initialExtractId = urlParams.get('id');
    const initialPage = urlParams.get('page');
    console.log('Parsed Params:', { initialExtractId, initialPage });

    loadExtractions(initialExtractId, initialPage);
    initTags();

    // Page select listener
    const pageSel = document.getElementById('pageSelect');
    pageSel.addEventListener('change', (e) => {
        selectedPage = e.target.value || null;
        console.log('Page Selected:', selectedPage);
        renderSourceList();
        renderGroupList();
    });
});


// Load configured tags into select
// Load configured tags into radio buttons area
async function initTags() {
    try {
        const res = await fetch('/api/tags');
        const tags = await res.json();
        if (Array.isArray(tags) && tags.length > 0) {
            window.currentTags = tags;
        } else {
            window.currentTags = [...(typeof GROUP_TAGS !== 'undefined' ? GROUP_TAGS : [])];
        }
    } catch (e) {
        console.error('Failed to load tags', e);
        window.currentTags = [...(typeof GROUP_TAGS !== 'undefined' ? GROUP_TAGS : [])];
    }
    loadTags();
}

function loadTags() {
    const list = document.getElementById('tagSelectionArea');
    if (!list) return;
    list.innerHTML = '';

    // Use window.currentTags
    const tags = window.currentTags || [];

    tags.forEach((tag, index) => {
        const btn = document.createElement('button');
        btn.className = 'tag-btn';
        btn.style.backgroundColor = tag.color;
        btn.innerHTML = `<i class="fas fa-tag"></i> ${tag.label}`;
        btn.title = `Gom nhóm dữ liệu vào: ${tag.label}`;

        btn.onclick = () => moveToGroup(tag.id);

        list.appendChild(btn);
    });
}
// Tag Manager Functions
function openTagManager() {
    document.getElementById('tagManagerModal').style.display = 'flex';
    renderTagManagerList();
}
function closeTagManager() {
    document.getElementById('tagManagerModal').style.display = 'none';
}
function renderTagManagerList() {
    const tbody = document.querySelector('#tagManagerList tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const tags = window.currentTags || [];
    tags.forEach((tag, idx) => {
        const tr = document.createElement('tr');

        // Label Input Column
        const tdLabel = document.createElement('td');
        const inputLabel = document.createElement('input');
        inputLabel.type = 'text';
        inputLabel.value = tag.label;
        inputLabel.className = 'tag-edit-input';
        inputLabel.onchange = (e) => {
            const newLabel = e.target.value.trim();
            if (!newLabel) return;
            window.currentTags[idx].label = newLabel;
            // Update ID if it's a generic one
            if (window.currentTags[idx].id === tag.label.toLowerCase().replace(/\s+/g, '_')) {
                window.currentTags[idx].id = newLabel.toLowerCase().replace(/\s+/g, '_');
            }
            loadTags();
        };
        tdLabel.appendChild(inputLabel);

        // Color Input Column
        const tdColor = document.createElement('td');
        const inputColor = document.createElement('input');
        inputColor.type = 'color';
        inputColor.value = tag.color;
        inputColor.className = 'color-input';
        inputColor.onchange = (e) => {
            window.currentTags[idx].color = e.target.value;
            loadTags();
        };
        tdColor.appendChild(inputColor);

        // Action Column
        const tdAction = document.createElement('td');
        tdAction.style.textAlign = 'center';
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn-delete-tag';
        btnDelete.title = 'Xóa Tag';
        btnDelete.innerHTML = '<i class="fas fa-trash"></i>';
        btnDelete.onclick = () => deleteTag(idx);
        tdAction.appendChild(btnDelete);

        tr.appendChild(tdLabel);
        tr.appendChild(tdColor);
        tr.appendChild(tdAction);
        tbody.appendChild(tr);
    });
}
function addNewTag() {
    const labelInput = document.getElementById('newTagName');
    const colorInput = document.getElementById('newTagColor');
    const label = labelInput.value.trim();
    const color = colorInput.value;

    if (!label) return alert('Vui lòng nhập tên Tag');

    const id = label.toLowerCase().replace(/\s+/g, '_');

    // Check for duplicate ID
    if (window.currentTags.some(t => t.id === id)) {
        return alert('Tag này đã tồn tại!');
    }

    window.currentTags.push({ id, label, color });
    labelInput.value = '';
    renderTagManagerList();
    loadTags();
}

function deleteTag(index) {
    const tag = window.currentTags[index];
    if (!tag) return;

    if (!confirm(`Bạn có chắc chắn muốn xóa tag "${tag.label}" không?`)) return;

    window.currentTags.splice(index, 1);
    console.log('Tag deleted at index:', index);

    renderTagManagerList();
    loadTags();
}

async function saveTagsToServer() {
    try {
        const response = await fetch('/api/save-tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: window.currentTags })
        });
        const res = await response.json();
        if (res.success) {
            alert('Đã lưu các thay đổi!');
            closeTagManager();
            renderGroupList(); // Re-render groups to reflect color/name changes
        } else {
            alert('Lỗi khi lưu: ' + (res.error || 'Unknown error'));
        }
    } catch (e) {
        console.error('Error saving tags:', e);
        alert('Lỗi kết nối server khi lưu tag');
    }
}

// Action: Move Selected to New Group (into Pending)
function moveToGroup(tagId = null) {
    if (!selectedPage) return;

    // Find selected inputs in source list
    const inputs = document.querySelectorAll('#sourceList .item-checkbox:checked');
    if (inputs.length === 0) return alert('Vui lòng chọn ít nhất 1 mục để gom nhóm');

    const selectedIds = Array.from(inputs).map(i => i.value);
    const selectedItems = sourceItems.filter(i => selectedIds.includes(i.id));

    // Determine tag
    let tag = tagId;
    if (!tag) {
        tag = 'note';
    }

    // Create a sub-group in pending
    pendingSubGroups.push({
        tag: tag,
        items: selectedItems
    });

    // Mark as grouped
    selectedIds.forEach(id => groupedItemIds.add(id));

    // Re-render
    renderSourceList();
    renderGroupList();

    // Show Save button
    const saveBtn = document.getElementById('saveGroupBtn');
    if (saveBtn) saveBtn.style.display = 'flex';
}

// Naming Modal Functions
function openNamingModal() {
    if (pendingSubGroups.length === 0) return alert('Chưa có mục nào được gán tag!');
    renamingMasterIndex = -1; // Create mode

    // Count groups on this page to suggest "Group N+1"
    const currentPageGroups = groups.filter(g => String(g.page) === String(selectedPage));
    const nextNum = currentPageGroups.length + 1;
    const defaultName = `Group ${nextNum}`;

    const modal = document.getElementById('groupNamingModal');
    const input = document.getElementById('groupNameInput');
    const title = modal ? modal.querySelector('h3') : null;

    if (modal && input) {
        if (title) title.innerHTML = '<i class="fas fa-folder-plus"></i> Đặt tên Nhóm';
        modal.style.display = 'flex';
        input.value = defaultName;

        // Auto-select for easy overwriting
        setTimeout(() => {
            input.focus();
            input.select();
        }, 30);
    }
}

function openRenameModal(index) {
    renamingMasterIndex = index;
    const group = groups[index];
    if (!group) return;

    const modal = document.getElementById('groupNamingModal');
    const input = document.getElementById('groupNameInput');
    const title = modal ? modal.querySelector('h3') : null;

    if (modal && input) {
        if (title) title.innerHTML = '<i class="fas fa-edit"></i> Đổi tên Nhóm';
        modal.style.display = 'flex';
        input.value = group.name;

        setTimeout(() => {
            input.focus();
            input.select();
        }, 30);
    }
}

function closeNamingModal() {
    document.getElementById('groupNamingModal').style.display = 'none';
    renamingMasterIndex = -1;
}

function confirmSaveGroup() {
    const nameInput = document.getElementById('groupNameInput');
    const name = nameInput.value.trim();
    if (!name) return alert('Vui lòng nhập tên nhóm!');

    if (renamingMasterIndex >= 0) {
        // RENAME MODE
        groups[renamingMasterIndex].name = name;
    } else {
        // CREATE MODE
        // Create master group
        groups.push({
            name: name,
            page: selectedPage,
            subGroups: [...pendingSubGroups]
        });

        // Clear pending
        pendingSubGroups = [];

        // Hide save button
        const saveBtn = document.getElementById('saveGroupBtn');
        if (saveBtn) saveBtn.style.display = 'none';
    }

    closeNamingModal();
    renderGroupList();
    saveGroups(); // Persist to server
}

function cancelPending() {
    if (!confirm('Hủy bỏ các thay đổi chưa lưu?')) return;
    pendingSubGroups.forEach(sg => {
        sg.items.forEach(item => groupedItemIds.delete(item.id));
    });
    pendingSubGroups = [];
    const saveBtn = document.getElementById('saveGroupBtn');
    if (saveBtn) saveBtn.style.display = 'none';
    renderSourceList();
    renderGroupList();
}

// Fetch extraction folders from backend
async function loadExtractions(initialId = null, initialPage = null) {
    try {
        const response = await fetch('/api/extractions');
        const res = await response.json();
        const extractions = res.extractions || [];

        const select = document.getElementById('extractionSelect');
        select.innerHTML = '<option value="">-- Chọn Extraction --</option>';

        extractions.forEach(ext => {
            const opt = document.createElement('option');
            opt.value = ext.id;
            opt.textContent = ext.name || ext.id; // Use date/timestamp
            select.appendChild(opt);
        });

        // Auto load if changed
        select.addEventListener('change', (e) => {
            if (e.target.value) {
                loadExtractionData(e.target.value);
            } else {
                document.getElementById('pageSelect').style.display = 'none';
                document.getElementById('sourceList').innerHTML = '';
                document.getElementById('groupList').innerHTML = '';
            }
        });

        // Handle initial selection from URL
        if (initialId && extractions.find(e => e.id === initialId)) {
            console.log('Auto-selecting extraction:', initialId);
            select.value = initialId;
            loadExtractionData(initialId, initialPage);
        } else {
            console.warn('Initial ID not found in list:', initialId);
            if (extractions.length > 0) {
                // Fallback: Select the first one to let user test immediately
                const firstId = extractions[0].id;
                // alert(`Extraction ID from URL not found. Auto-selecting: ${firstId}`);
                select.value = firstId;
                loadExtractionData(firstId, initialPage);
            }
        }

    } catch (error) {
        console.error('Error loading extractions:', error);
    }
}

// Get Page from path (e.g., "1/images/foo.png" -> "1")
function getPageFromPath(pathStr) {
    if (!pathStr) return 'Unknown';
    const parts = pathStr.split('/');
    if (parts.length > 0) return parts[0]; // Assuming "PageNumber/..." structure
    return 'Unknown';
}

// Load data for specific extraction
async function loadExtractionData(id, initialPage = null) {
    groupExtractionId = id;
    const sourceList = document.getElementById('sourceList');
    const groupList = document.getElementById('groupList');

    sourceList.innerHTML = '<p class="loading">Đang tải data...</p>';
    groupList.innerHTML = '';
    groups = [];
    groupedItemIds.clear();
    availablePages.clear();
    sourceItems = [];

    // --- MOCK DATA REMOVED ---

    // selectedPage = '1'; // Let auto-select handle this based on real available pages
    // -------------------------

    try {
        console.log('Loading Extraction Data for:', id);
        // Fetch items
        const response = await fetch(`/api/extraction/${id}`);
        // API returns { success: true, data: result, extractPath: id }
        const res = await response.json();
        const data = res.data;
        currentExtractionData = data;
        console.log('Data Received:', data);

        // Update PDF Viewer
        const pdfViewer = document.getElementById('pdfViewer');
        const noPdfMsg = document.getElementById('noPdfMessage');

        if (pdfViewer) {
            if (data.pdfFiles && data.pdfFiles.length > 0) {
                // Use the first PDF found
                const pdfUrl = `/uploads/${id}/${data.pdfFiles[0]}`;
                pdfViewer.src = pdfUrl;
                pdfViewer.style.display = 'block';
                if (noPdfMsg) noPdfMsg.style.display = 'none';
            } else {
                pdfViewer.src = '';
                pdfViewer.style.display = 'none';
                if (noPdfMsg) noPdfMsg.style.display = 'block';
            }
        }

        // Process Pages
        if (data.pages && Array.isArray(data.pages)) {
            data.pages.forEach(page => {
                let pageNum = String(page.pageNumber);
                availablePages.add(pageNum);

                // 1. Text Lines
                if (page.text) {
                    const lines = page.text.split(/\r?\n/).filter(l => l.trim().length > 0);
                    lines.forEach((line, idx) => {
                        sourceItems.push({
                            id: `text_${pageNum}_${idx}`,
                            type: 'text',
                            content: line,
                            page: pageNum
                        });
                    });
                }

                // 2. Images
                if (page.images) {
                    page.images.forEach((img, idx) => {
                        sourceItems.push({
                            id: `img_${pageNum}_${idx}`,
                            type: 'image',
                            content: img.filename,
                            src: `/uploads/${id}/${img.path}`,
                            page: pageNum,
                            path: img.path
                        });
                    });
                }

                // 3. Tables
                if (page.tables) {
                    page.tables.forEach((tbl, idx) => {
                        sourceItems.push({
                            id: `tbl_${pageNum}_${idx}`,
                            type: 'table',
                            content: tbl.filename,
                            path: tbl.path,
                            page: pageNum
                        });
                    });
                }
            });
        }

        // --- MOCK DATA FOR TESTING (USER REQUEST) ---
        // Force 10 dummy images for Page 1
        // ---------------------------------------------

        console.log('Source Items Parsed:', sourceItems.length, sourceItems);

        // Load existing saved groups if any
        if (data.groups && Array.isArray(data.groups)) {
            // Migration/Normalization: Handle old flat array if found
            groups = data.groups.map(g => {
                if (g.subGroups) return g; // Already new structure
                // Convert old flat group to a master group with 1 subgroup
                const tagInfo = (window.currentTags || GROUP_TAGS).find(t => t.id === g.tag) || { label: 'Old Group' };
                return {
                    name: `Group-${tagInfo.label}`,
                    page: g.page,
                    subGroups: [{ tag: g.tag, items: g.items }]
                };
            });

            // Track IDs
            groups.forEach(mg => {
                mg.subGroups.forEach(sg => {
                    sg.items.forEach(i => groupedItemIds.add(i.id));
                });
            });
        }

        renderPageSelect();

        // Auto select page
        if (availablePages.size > 0) {
            const sortedPages = Array.from(availablePages).sort((a, b) => parseInt(a) - parseInt(b));
            console.log('Available Pages:', sortedPages);

            if (initialPage && availablePages.has(String(initialPage))) {
                selectedPage = String(initialPage);
                console.log('Selected Initial Page:', selectedPage);
            } else {
                selectedPage = sortedPages[0];
                console.log('Defaulted to Page:', selectedPage);
            }

            document.getElementById('pageSelect').value = selectedPage;
        } else {
            console.warn('No pages found available');
        }

        renderSourceList();
        renderGroupList();

    } catch (error) {
        console.error(error);
        sourceList.innerHTML = `<p class="error">Lỗi tải dữ liệu: ${error.message}</p>`;
    }
}

function renderPageSelect() {
    const pageSel = document.getElementById('pageSelect');
    pageSel.innerHTML = ''; // Clear
    pageSel.style.display = 'inline-block';

    const pages = Array.from(availablePages).sort((a, b) => parseInt(a) - parseInt(b));
    pages.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = `Page ${p}`;
        pageSel.appendChild(opt);
    });
}

// Render the left column
function renderSourceList() {
    updatePdfDisplay();
    const list = document.getElementById('sourceList');
    list.innerHTML = '';

    // Filter items by page AND not grouped
    // RELAXED MATCHING: parseInt
    const visibleItems = sourceItems.filter(item => {
        // If selectedPage is set, try to match it loosely
        if (selectedPage) {
            const match = (item.page == selectedPage) || (parseInt(item.page) === parseInt(selectedPage));
            return match && !groupedItemIds.has(item.id);
        }
        return !groupedItemIds.has(item.id);
    });

    console.log('Visible Items:', visibleItems.length);
    document.getElementById('sourceCount').textContent = `${visibleItems.length} items`;

    if (visibleItems.length === 0) {
        const warning = document.createElement('div');
        warning.style.padding = '10px';
        warning.style.color = '#666';
        warning.innerHTML = selectedPage ? `Không tìm thấy item nào trong Page ${selectedPage}.` : 'Không có item.';
        list.appendChild(warning);

        // Show ALL items button if empty
        if (sourceItems.length > 0) {
            const showAllBtn = document.createElement('button');
            showAllBtn.textContent = 'Show All Items (Debug)';
            showAllBtn.onclick = () => {
                selectedPage = null; // Clear page filter
                renderSourceList();
            };
            list.appendChild(showAllBtn);
        }
        return;
    }

    visibleItems.forEach(item => {
        // Render Item
        const btn = document.createElement('div');
        btn.className = 'groupable-item';
        if (item.type === 'image') {
            btn.classList.add('type-image');
        }

        btn.onclick = (e) => {
            if (e.target.type !== 'checkbox') {
                const cb = btn.querySelector('input');
                cb.checked = !cb.checked;
                btn.classList.toggle('selected', cb.checked);
            }
        };
        // Checkbox listener to toggle class
        // Note: The onclick handles click on container. 
        // If clicking checkbox directly, event propagates, onclick runs.
        // But e.target IS checkbox. Logic:
        // if e.target != checkbox -> toggle check.
        // if e.target == checkbox -> check changed native, just toggle class?
        // Let's attach listener to checkbox to be safe for sync.

        const label = item.content.length > 60 ? item.content.substring(0, 60) + '...' : item.content;

        // Image source logic
        let imgHtml = '';
        if (item.type === 'image' && item.src) {
            imgHtml = `<img src="${item.src}" alt="${item.content}" loading="lazy">`;
        }

        if (item.type === 'image') {
            btn.innerHTML = `
                <input type="checkbox" class="item-checkbox" value="${item.id}" style="position: absolute; top: 5px; left: 5px; z-index: 10;">
                <div style="width: 100%; height: 80px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                    ${imgHtml}
                </div>
                <div class="image-filename" style="font-size: 0.75rem; text-align: center; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 4px;" title="${item.content}">
                    ${item.content}
                </div>
            `;
        } else {
            // Only show type badge if it's not TEXT, or per user request: "remove TEXT"
            const typeLabel = item.type.toUpperCase() === 'TEXT' ? '' : `<span class="item-type-badge" style="font-weight: bold; font-size: 0.8em; color: #555; width: 40px; margin-right:5px;">${item.type.toUpperCase()}</span>`;

            btn.innerHTML = `
                <input type="checkbox" class="item-checkbox" value="${item.id}">
                ${imgHtml}
                ${typeLabel}
                <span class="item-content-text" style="flex:1; word-break: break-all;">${label}</span>
            `;
        }

        // Update class on checkbox change
        const cb = btn.querySelector('input');
        cb.onchange = () => {
            btn.classList.toggle('selected', cb.checked);
        };

        if (groupedItemIds.has(item.id)) {
            // Should not happen as we filter them out, but if logic changes:
            btn.style.opacity = '0.5';
        }

        list.appendChild(btn);
    });
}

// Toggle Edit Mode for a Group
function toggleEditGroup(index) {
    if (editingGroupIndex === index) {
        editingGroupIndex = -1; // Save/Exit
    } else {
        editingGroupIndex = index;
    }
    renderGroupList();
    renderSourceList(); // Update source list state if needed
}

// Remove single item from group
function removeItemFromGroup(groupIndex, itemIndex) {
    const group = groups[groupIndex];
    if (!group) return;

    // Remove from group
    const item = group.items[itemIndex];
    group.items.splice(itemIndex, 1);

    // Remove from grouped tracker so it reappears in list
    groupedItemIds.delete(item.id);

    renderGroupList();
    renderSourceList();
}

// Add currently selected items from Left Column to an existing Master Group with a specific tag
function addItemsToMasterWithTag(mgIndex, tagId) {
    const inputs = document.querySelectorAll('#sourceList .item-checkbox:checked');
    if (inputs.length === 0) return alert('Vui lòng chọn ít nhất 1 mục từ danh sách bên trái');

    const selectedIds = Array.from(inputs).map(i => i.value);
    const selectedItems = sourceItems.filter(i => selectedIds.includes(i.id));

    const mg = groups[mgIndex];
    if (!mg) return;

    // Find or create sub-group for this tag
    let sg = mg.subGroups.find(s => s.tag === tagId);
    if (sg) {
        sg.items.push(...selectedItems);
    } else {
        mg.subGroups.push({ tag: tagId, items: selectedItems });
    }

    // Mark as grouped
    selectedIds.forEach(id => groupedItemIds.add(id));

    // Cleanup checkboxes
    inputs.forEach(inpt => inpt.checked = false);

    renderSourceList();
    renderGroupList();
    saveGroups();
}

// Toggle Group Collapse
function toggleGroupCollapse(index) {
    if (expandedGroupIndices.has(index)) {
        expandedGroupIndices.delete(index);
    } else {
        expandedGroupIndices.add(index);
    }
    renderGroupList();
}

// Update PDF display based on current page
function updatePdfDisplay() {
    const pdfViewer = document.getElementById('pdfViewer');
    const noPdfMsg = document.getElementById('noPdfMessage');
    if (!pdfViewer) return;

    let pdfUrl = '';

    // 1. Try Root PDF (Full Document) - Navigate to page
    if (currentExtractionData && currentExtractionData.pdfFiles && currentExtractionData.pdfFiles.length > 0) {
        // Use first PDF
        pdfUrl = `/uploads/${groupExtractionId}/${currentExtractionData.pdfFiles[0]}`;
        if (selectedPage) {
            // Append #page=N
            pdfUrl += `#page=${selectedPage}`;
            // Also force refresh of iframe if src is same base but different hash?
            // Browsers handle hash change usually.
        }
    }
    // 2. Try Per-Page PDF (Split Document)
    else if (currentExtractionData && currentExtractionData.pages) {
        const pageObj = currentExtractionData.pages.find(p => String(p.pageNumber) === String(selectedPage));
        if (pageObj && pageObj.pdfFile) {
            pdfUrl = `/uploads/${groupExtractionId}/${pageObj.pdfFile.path}`;
        }
    }

    if (pdfUrl) {
        // Only update if changed to avoid flicker, BUT hash change might need update?
        // If query/hash changes, assigning src works.
        // decoding URL to check equality
        // if (decodeURIComponent(pdfViewer.contentWindow.location.href).includes(pdfUrl)) return; 
        // Security restriction might block contentWindow access if cross origin (unlikely here).

        // Simple assignment
        if (pdfViewer.getAttribute('src') !== pdfUrl) {
            pdfViewer.src = pdfUrl;
        }

        pdfViewer.style.display = 'block';
        if (noPdfMsg) noPdfMsg.style.display = 'none';
    } else {
        pdfViewer.style.display = 'none';
        if (noPdfMsg) noPdfMsg.style.display = 'block';
    }
}

// Updated renderGroupList for Delete Item and Add Actions
// Updated renderGroupList for Master-SubGroup Structure
function renderGroupList() {
    const list = document.getElementById('groupList');
    if (!list) return;
    list.innerHTML = '';

    const currentTags = window.currentTags || GROUP_TAGS;

    // 1. Render PENDING (DRAFT) Groups
    if (pendingSubGroups.length > 0) {
        const draftDiv = document.createElement('div');
        draftDiv.className = 'master-group-panel';
        draftDiv.style.border = '2px dashed #10b981';

        draftDiv.innerHTML = `
            <div class="master-group-header" style="background:#ecfdf5; color:#059669;">
                <span><i class="fas fa-edit"></i> Đang chọn (${pendingSubGroups.length} tag)</span>
                <button class="btn-icon-small" onclick="cancelPending()" title="Hủy bỏ" style="color:#ef4444;"><i class="fas fa-times"></i></button>
            </div>
            <div class="master-group-content">
                ${pendingSubGroups.map((sg, idx) => {
            const tagInfo = currentTags.find(t => t.id === sg.tag) || currentTags[0];
            return `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; padding:8px; background:#f9fafb; border-radius:8px; border-left: 5px solid ${tagInfo.color}">
                            <span style="font-weight:700; font-size:0.85rem;">${tagInfo.label} (${sg.items.length})</span>
                            <button class="btn-icon-small" onclick="removePendingSubGroup(${idx})" style="color:#94a3b8;"><i class="fas fa-minus-circle"></i></button>
                        </div>
                    `;
        }).join('')}
                <div style="margin-top:10px; color:#64748b; font-size:0.8rem; text-align:center;">
                    Nhấn "Save as Group" ở cột giữa để đặt tên và lưu.
                </div>
            </div>
        `;
        list.appendChild(draftDiv);
    }

    // 2. Render SAVED MASTER Groups
    const visibleMasterGroups = groups.filter(mg => String(mg.page) === String(selectedPage));

    if (visibleMasterGroups.length === 0 && pendingSubGroups.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8; font-style:italic;">Chưa có nhóm nào...</div>';
    }

    visibleMasterGroups.forEach((mg) => {
        const actualIndex = groups.indexOf(mg);
        const isExpanded = expandedGroupIndices.has(actualIndex);

        const panel = document.createElement('div');
        panel.className = 'master-group-panel';

        panel.innerHTML = `
            <div class="master-group-header" onclick="toggleMasterGroup(${actualIndex})">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-chevron-${isExpanded ? 'down' : 'right'}"></i>
                    <span>${mg.name}</span>
                </div>
                <div class="group-actions" onclick="event.stopPropagation()">
                    <button class="btn-icon-small" onclick="openRenameModal(${actualIndex})" title="Đổi tên nhóm" style="color:#3498db; margin-right:5px;"><i class="fas fa-pen"></i></button>
                    <button class="btn-icon-small" onclick="removeMasterGroup(${actualIndex})" title="Xóa toàn bộ nhóm" style="color:#ef4444;"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="master-group-content" style="display: ${isExpanded ? 'block' : 'none'};">
                ${mg.subGroups.map((sg, sgIdx) => {
            const tagInfo = currentTags.find(t => t.id === sg.tag) || currentTags[0];
            return `
                        <div class="subgroup-container" style="margin-bottom:12px; border-left: 4px solid ${tagInfo.color}; padding-left:12px; background:#fcfcfc; border-radius:0 6px 6px 0; padding-top:4px; padding-bottom:4px;">
                            <div style="font-weight:800; font-size:0.7rem; color:#94a3b8; margin-bottom:6px; display:flex; justify-content:space-between; text-transform:uppercase; letter-spacing:0.05em;">
                                <span>${tagInfo.label}</span>
                                <span>${sg.items.length} items</span>
                            </div>
                            <div class="subgroup-items">
                                ${sg.items.map((item, iIdx) => `
                                    <div class="groupable-item group-member-item" style="padding:6px; font-size:0.85rem; border:1px solid #edf2f7; margin-bottom:4px; display:flex; align-items:center; gap:8px; background:white; border-radius:4px;">
                                        <div style="width:24px; text-align:center; color:#94a3b8;">${getItemIcon(item.type)}</div>
                                        <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#334155;">${item.content}</div>
                                        <button onclick="removeItemFromMaster(${actualIndex}, ${sgIdx}, ${iIdx})" style="border:none; background:none; color:#cbd5e1; cursor:pointer; padding:4px;" title="Xóa mục"><i class="fas fa-times"></i></button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>

            <div class="master-group-footer" style="display: ${isExpanded ? 'flex' : 'none'};">
                <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 700; width: 100%; margin-bottom: 4px;">ADD SELECTED ITEMS AS:</span>
                ${currentTags.map(tag => `
                    <button class="tag-mini-btn" style="background-color: ${tag.color};" onclick="addItemsToMasterWithTag(${actualIndex}, '${tag.id}')" title="Thêm mục đã chọn vào nhóm này với tag ${tag.label}">
                        <i class="fas fa-plus"></i> ${tag.label}
                    </button>
                `).join('')}
            </div>
        `;
        list.appendChild(panel);
    });
}

function toggleMasterGroup(index) {
    if (expandedGroupIndices.has(index)) expandedGroupIndices.delete(index);
    else expandedGroupIndices.add(index);
    renderGroupList();
}

function removeMasterGroup(index) {
    if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ nhóm này và đưa các mục về danh sách nguồn?')) return;
    const mg = groups[index];
    mg.subGroups.forEach(sg => {
        sg.items.forEach(item => groupedItemIds.delete(item.id));
    });
    groups.splice(index, 1);
    renderSourceList();
    renderGroupList();
    saveGroups();
}

function removePendingSubGroup(idx) {
    const sg = pendingSubGroups[idx];
    sg.items.forEach(item => groupedItemIds.delete(item.id));
    pendingSubGroups.splice(idx, 1);

    if (pendingSubGroups.length === 0) {
        document.getElementById('saveGroupBtn').style.display = 'none';
    }
    renderSourceList();
    renderGroupList();
}

function removeItemFromMaster(mgIndex, sgIndex, itemIndex) {
    const mg = groups[mgIndex];
    if (!mg || !mg.subGroups[sgIndex]) return;

    const i = mg.subGroups[sgIndex].items[itemIndex];
    if (!i) return;

    groupedItemIds.delete(i.id);
    mg.subGroups[sgIndex].items.splice(itemIndex, 1);

    // Cleanup empty sub-groups
    if (mg.subGroups[sgIndex].items.length === 0) {
        mg.subGroups.splice(sgIndex, 1);
    }

    // Cleanup empty master groups
    if (mg.subGroups.length === 0) {
        groups.splice(mgIndex, 1);
    }

    renderSourceList();
    renderGroupList();
    saveGroups();
}

function getItemIcon(type) {
    if (type === 'text') return '<i class="fas fa-font"></i>';
    if (type === 'image') return '<i class="fas fa-image"></i>';
    return '<i class="fas fa-table"></i>';
}

// Action: Remove Group (Ungroup) - Legacy for safety
function removeGroup(index) {
    removeMasterGroup(index);
}

// Save Groups to Backend
async function saveGroups() {
    if (!groupExtractionId) return;

    try {
        const response = await fetch('/api/save-groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                extractPath: groupExtractionId,
                groups: groups
            })
        });
        const res = await response.json();
        console.log('Save Result:', res);
    } catch (e) {
        console.error('Save Error:', e);
    }
}
