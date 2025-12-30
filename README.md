# PDF Extract Result Viewer

**Node.js + Express Backend | HTML/CSS/JS Frontend**

Ứng dụng web để preview kết quả bóc tách từ file PDF nhiều trang.

## 🚀 Tính Năng

- ✅ Upload file ZIP (tối đa 500MB)
- ✅ Backend xử lý với Node.js + Express
- ✅ Preview images với lightbox
- ✅ Hiển thị Excel tables (SheetJS)
- ✅ Xem nội dung text
- ✅ Download files
- ✅ Copy text to clipboard
- ✅ Auto cleanup old files (24h)

## 📁 Cấu Trúc ZIP Input

```
result.zip
├── page_1/
│   ├── images/
│   │   ├── image_1.png
│   │   ├── image_2.jpg
│   ├── tables/
│   │   ├── table_1.xlsx
│   ├── page_1.pdf (optional)
│   └── content.txt
├── page_2/
│   └── [same structure]
```

## 🛠️ Công Nghệ

**Backend:**
- Node.js
- Express.js
- Multer (file upload)
- adm-zip (ZIP extraction)
- SheetJS (Excel processing)

**Frontend:**
- HTML5
- CSS3 (Vanilla)
- JavaScript (Vanilla)
- Font Awesome Icons

## 📦 Cài Đặt

```bash
# 1. Install dependencies
npm install

# 2. Start server
npm start

# 3. Mở browser
http://localhost:3000
```

## 🎯 Cách Sử Dụng

1. **Start Server**: `npm start`
2. **Upload ZIP**: Kéo thả file ZIP vào upload zone
3. **Preview**: Xem images, tables, text của từng page
4. **Download**: Click download để tải file gốc

## 📂 Cấu Trúc Project

```
pdf-extract-viewer/
├── server.js           # Express server
├── package.json
├── public/             # Frontend files
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
└── uploads/            # Uploaded & extracted files (auto-cleanup)
```

## 🔧 API Endpoints

- `POST /api/upload` - Upload & extract ZIP
- `GET /api/file/:extractPath/:filePath` - Get file content

## 📝 Lưu Ý

- File ZIP tối đa 500MB
- Chỉ chấp nhận file .zip
- Cấu trúc folder phải đúng format `page_N/`
- Excel files phải là .xlsx
- Files tự động xóa sau 24h

## 🌐 Browser Support

- Chrome/Edge: ✅
- Firefox: ✅
- Safari: ✅

## 📄 License

MIT License

---

**Made with ❤️ using Node.js + Express**
