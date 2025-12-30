# Hướng Dẫn Cấu Hình OneDrive (API Key & CID)

Để tính năng "Edit Online" hoạt động chính xác với tài khoản OneDrive cá nhân của bạn, hệ thống cần biết đường dẫn gốc (`rootPath`) và `CID` của tài khoản để tạo link.

## 1. Cách Lấy CID (Customer ID)

Hệ thống hiện tại tạo link trực tiếp dạng: `https://onedrive.live.com/?id=...` sử dụng cấu trúc của OneDrive Cá nhân.

**Các bước thực hiện:**
1. Đăng nhập vào [OneDrive Web](https://onedrive.live.com/) trên trình duyệt.
2. Quan sát URL trên thanh địa chỉ.
   - Nó thường có dạng: `https://onedrive.live.com/?id=root&cid=XXXXXXXXXXXXXXXX`
   - Hoặc khi vào folder: `https://onedrive.live.com/?id=XXXXXXXXXXXXXXXX%21105&cid=XXXXXXXXXXXXXXXX`
3. **CID** chính là chuỗi ký tự sau `cid=` (ví dụ: `69551be368fd8730`).

## 2. Cách Lấy Đường Dẫn Gốc (Root Path)

Để link hoạt động, file cần nằm đúng vị trí trên OneDrive.
Cấu trúc đường dẫn thường là:
`/personal/{CID}/Documents/{FolderName}`

**Ví dụ:**
Nếu CID của bạn là `69551be368fd8730` và bạn upload file vào thư mục `uploads` trên OneDrive.
Đường dẫn `oneDriveRootPath` sẽ là:
`/personal/69551be368fd8730/Documents/uploads`

## 3. Cập Nhật Cấu Hình

Để cập nhật vào hệ thống:
1. Mở file `server.js` (hoặc tạo API lưu config riêng).
2. Tìm dòng:
   ```javascript
   let oneDriveRootPath = "/personal/69551be368fd8730/Documents/uploads";
   ```
3. Thay thế bằng đường dẫn của bạn.

---

## (Nâng Cao) Microsoft Graph API

Nếu bạn muốn tích hợp sâu hơn (Tự động upload lên OneDrive, lấy link edit trực tiếp qua API):
1. Truy cập [Azure App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).
2. Tạo App mới -> Chọn "Accounts in any organizational directory and personal Microsoft accounts".
3. Lấy **Application (client) ID**.
4. Cấu hình **Client Secret**.
5. Cấp quyền `Files.ReadWrite`.
