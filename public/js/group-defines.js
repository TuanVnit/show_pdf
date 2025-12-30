const GROUP_TAGS = [
    { id: 'note', label: 'Note', color: '#f39c12' },
    { id: 'title', label: 'Title', color: '#e74c3c' },
    { id: 'caption', label: 'Caption', color: '#3498db' },
    { id: 'unit', label: 'Unit', color: '#9b59b6' },
    { id: 'header', label: 'Header', color: '#2ecc71' },
    { id: 'footer', label: 'Footer', color: '#34495e' },
    { id: 'other', label: 'Other', color: '#95a5a6' }
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GROUP_TAGS;
}
