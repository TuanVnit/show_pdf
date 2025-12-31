// Global state for Group Logic
var groupExtractionId = null;

let sourceItems = [];
let groups = [];
let groupedItemIds = new Set(); // Track items already in groups
let availablePages = new Set();
var selectedPage = null;
let editingGroupIndex = -1; // Track active editing group
let expandedGroupIndices = new Set(); // Track expanded groups
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

    // Use window.currentTags instead of GROUP_TAGS
    const tags = window.currentTags || [];

    tags.forEach((tag, index) => {
        const label = document.createElement('label');
        label.className = 'tag-radio-label';
        label.style.backgroundColor = tag.color;

        // Input
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'selectedTag';
        input.value = tag.id;

        // Icon Indicator
        const icon = document.createElement('i');
        icon.className = 'fas fa-check tag-check-icon';
        icon.style.marginRight = '6px';
        icon.style.fontSize = '1.1em';
        // Check initial state
        if (index === 0) {
            label.classList.add('selected');
            input.checked = true;
            icon.style.display = 'inline-block';
        } else {
            icon.style.display = 'none';
        }

        input.addEventListener('change', () => {
            document.querySelectorAll('.tag-radio-label').forEach(l => l.classList.remove('selected'));
            document.querySelectorAll('.tag-check-icon').forEach(i => i.style.display = 'none');

            label.classList.add('selected');
            icon.style.display = 'inline-block';
        });

        label.appendChild(input);
        label.appendChild(icon); // Prepend icon
        label.appendChild(document.createTextNode(tag.label));
        list.appendChild(label);
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
    tbody.innerHTML = '';
    (window.currentTags || []).forEach((tag, idx) => {
        tbody.innerHTML += `
            <tr>
                <td><input type="text" value="${tag.label}" onchange="window.currentTags[${idx}].label=this.value; loadTags();" class="tag-edit-input"></td>
                <td><input type="color" value="${tag.color}" onchange="window.currentTags[${idx}].color=this.value; loadTags();" class="color-input"></td>
                <td style="text-align:center;">
                    <button onclick="deleteTag(${idx})" class="btn-delete-tag" title="Delete Tag">
                        <i class="fas fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}
function addNewTag() {
    const label = document.getElementById('newTagName').value.trim();
    const color = document.getElementById('newTagColor').value;
    if (!label) return alert('Enter Tag Name');

    const id = label.toLowerCase().replace(/\s+/g, '_');
    window.currentTags.push({ id, label, color });
    document.getElementById('newTagName').value = '';
    renderTagManagerList();
    loadTags();
}
function deleteTag(index) {
    if (!confirm('Delete this tag?')) return;
    window.currentTags.splice(index, 1);
    renderTagManagerList();
    loadTags();
}
async function saveTagsToServer() {
    try {
        await fetch('/api/save-tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: window.currentTags })
        });
        alert('Tags Saved!');
        closeTagManager();
        renderGroupList(); // Re-render groups to reflect color/name changes
    } catch (e) {
        alert('Error saving tags');
    }
}

// Action: Move Selected to New Group
function moveToGroup() {
    if (!selectedPage) return;

    // Find selected inputs in source list
    const inputs = document.querySelectorAll('#sourceList .item-checkbox:checked');
    if (inputs.length === 0) return alert('Chọn ít nhất 1 item để group');

    const selectedIds = Array.from(inputs).map(i => i.value);
    const selectedItems = sourceItems.filter(i => selectedIds.includes(i.id));

    // Get selected tag from Radio
    const radio = document.querySelector('input[name="selectedTag"]:checked');
    const tag = radio ? radio.value : 'note'; // default fallback

    // Create group
    groups.push({
        tag: tag,
        page: selectedPage, // Important: Bind group to page
        items: selectedItems
    });

    // Mark as grouped
    selectedIds.forEach(id => groupedItemIds.add(id));

    // Re-render
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
                        // Skip images starting with 't' (case-insensitive) as per user request
                        if (img.filename && img.filename.toLowerCase().startsWith('t')) {
                            return;
                        }

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
            groups = data.groups;
            groups.forEach(g => {
                if (g.items) {
                    g.items.forEach(i => groupedItemIds.add(i.id));
                    // Check if group has a page property, if not try to infer from first item
                    if (!g.page && g.items.length > 0) {
                        g.page = g.items[0].page;
                    }
                }
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

// Add currently selected items from Left Column to this Group
function addSelectedToTargetGroup(groupIndex) {
    // Check items selected in source
    const inputs = document.querySelectorAll('#sourceList .item-checkbox:checked');
    if (inputs.length === 0) return alert('Hãy chọn items từ danh sách bên trái trước');

    const selectedIds = Array.from(inputs).map(i => i.value);
    const selectedItems = sourceItems.filter(i => selectedIds.includes(i.id));

    // Add to group
    groups[groupIndex].items.push(...selectedItems);

    // Mark as grouped
    selectedIds.forEach(id => groupedItemIds.add(id));

    // Clear selection in source
    inputs.forEach(i => i.checked = false);

    renderGroupList();
    renderSourceList();
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
function renderGroupList() {
    const list = document.getElementById('groupList');
    list.innerHTML = '';

    // Filter groups by selected page
    const visibleGroups = groups.filter(g => String(g.page) === String(selectedPage));

    visibleGroups.forEach((group) => {
        const actualIndex = groups.indexOf(group);
        const isEditing = (actualIndex === editingGroupIndex);
        let isExpanded = expandedGroupIndices.has(actualIndex);
        if (isEditing) isExpanded = true;

        const card = document.createElement('div');
        card.className = 'group-card';
        if (isEditing) card.style.border = '2px solid #3498db';

        const currentTags = window.currentTags || GROUP_TAGS;
        const tagInfo = currentTags.find(t => t.id === group.tag) || currentTags[0];
        const tagStyle = `background: ${tagInfo.color}`;

        // Header Actions - Keep Edit/Delete Group
        let actionButtons = `
            <button class="btn-icon-small" onclick="toggleEditGroup(${actualIndex})" title="${isEditing ? 'Done Sorting' : 'Sort Items'}">
                <i class="fas ${isEditing ? 'fa-check' : 'fa-sort'}"></i>
            </button>
            <button class="btn-icon-small" onclick="removeGroup(${actualIndex})" title="Delete Group">
                <i class="fas fa-trash"></i>
            </button>
        `;

        card.innerHTML = `
            <div class="group-header" onclick="toggleGroupCollapse(${actualIndex})" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; padding: 5px 0;">
                <div style="display:flex; align-items:center; gap: 8px;">
                    <i class="fas fa-chevron-${isExpanded ? 'down' : 'right'}" style="width: 15px; color:#555;"></i>
                    <span class="group-tag" style="${tagStyle}">${tagInfo.label}</span>
                    <span style="font-size: 0.8em; color: #888;">(${group.items.length})</span>
                </div>
                <div class="group-actions" onclick="event.stopPropagation()" style="display: flex; gap: 5px;">
                    ${actionButtons}
                </div>
            </div>
            
            <div class="group-items" id="group-items-${actualIndex}" style="display: ${isExpanded ? 'block' : 'none'};">
                ${group.items.map((item, idx) => `
                    <div class="groupable-item group-member-item" style="background: #f9f9f9; padding: 5px; display: block; position: relative;">
                         <button class="btn-delete-item" onclick="removeItemFromGroup(${actualIndex}, ${idx})" title="Remove item" 
                                 style="position:absolute; right:2px; top:2px; padding:2px 6px; border:none; background:rgba(255,255,255,0.9); border-radius:4px; color:#e74c3c; cursor:pointer; z-index:10;">
                            <i class="fas fa-times"></i>
                         </button>
                         
                         <div style="display:flex; align-items:center; gap: 5px; margin-bottom: 5px; padding-right: 20px;">
                            <div class="item-type-icon">${getItemIcon(item.type)}</div>
                            <span style="font-size: 0.8em; font-weight: bold;">${item.type}</span>
                         </div>
                         ${item.type === 'image' ? `<div style="text-align:center"><img src="${item.src}" class="preview-img-small" style="max-height: 60px; width: auto;"></div>` : ''}
                         <div class="item-content" style="font-size:0.85em; margin-top:2px;">${item.content}</div>
                    </div>
                `).join('')}
            </div>
            
            <!-- Group Footer: Always show Add Button if expanded -->
            <div style="display: ${isExpanded ? 'flex' : 'none'}; padding: 10px; border-top: 1px solid #eee; justify-content: center; gap: 10px; background: #fafafa;">
                <button class="btn-small btn-secondary" onclick="addSelectedToTargetGroup(${actualIndex})" style="font-size:0.8rem; flex:1;">
                    <i class="fas fa-plus"></i> Add Selected Items
                </button>
            </div>
        `;
        list.appendChild(card);
        // Init Sortable if editing
        if (isEditing) {
            const container = card.querySelector('.group-items');
            new Sortable(container, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: function (evt) {
                    // Reorder logic: array move
                    const item = groups[actualIndex].items.splice(evt.oldIndex, 1)[0];
                    groups[actualIndex].items.splice(evt.newIndex, 0, item);
                }
            });
        }
    });
}

function getItemIcon(type) {
    if (type === 'text') return '<i class="fas fa-font"></i>';
    if (type === 'image') return '<i class="fas fa-image"></i>';
    return '<i class="fas fa-table"></i>';
}

// (Old moveToGroup removed)

// Action: Remove Group (Ungroup)
function removeGroup(index) {
    const group = groups[index];
    // Return items to source
    group.items.forEach(item => groupedItemIds.delete(item.id));

    groups.splice(index, 1);

    renderSourceList();
    renderGroupList();
}

// Save Groups to Backend
async function saveGroups() {
    if (!currentExtraction) return alert('Chưa chọn extraction');
    if (groups.length === 0) return alert('Chưa có nhóm nào');

    try {
        const response = await fetch('/api/save-groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                extractPath: currentExtraction,
                groups: groups
            })
        });
        const res = await response.json();
        if (res.success) {
            alert('Lưu thành công!');
        } else {
            alert('Lỗi: ' + res.error);
        }
    } catch (e) {
        console.error(e);
        alert('Lỗi kết nối server');
    }
}
