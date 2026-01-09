# Hướng Dẫn Cấu Hình OneDrive "Edit Online" - Đầy Đủ

Tài liệu này hướng dẫn chi tiết cách thiết lập tính năng "Edit Online" để mở và chỉnh sửa file Excel trực tiếp trên OneDrive từ ứng dụng web.

---

## Tổng Quan Kiến Trúc

### Cách Hoạt Động:
1. **OneDrive Desktop Client** đồng bộ folder `uploads` từ local (`E:\RAG\Preview_folder\uploads`) lên OneDrive cloud (`C:\Users\pc\OneDrive\uploads`)
2. Khi user bấm "Edit Online", server dùng **Microsoft Graph API** để:
   - Tìm file trên OneDrive (đã được sync sẵn)
   - Tạo link edit cho file đó
   - Mở link trong tab mới
3. User chỉnh sửa file trên OneDrive Web
4. OneDrive tự động sync thay đổi về local

### Lợi Ích:
- ✅ Không cần upload file (tiết kiệm băng thông)
- ✅ Luôn edit đúng file gốc (không tạo bản sao)
- ✅ Thay đổi được sync 2 chiều (local ↔ cloud)
- ✅ Nhiều người có thể cùng edit (nếu được share folder)

---

## Phần 1: Tạo Azure App Registration

### Bước 1.1: Truy cập Azure Portal
1. Vào [Azure Portal](https://portal.azure.com)
2. Đăng nhập bằng tài khoản Microsoft của bạn (có thể là Personal account `@outlook.com`)

### Bước 1.2: Tạo App Registration Mới
1. Tìm kiếm **"App registrations"** trên thanh tìm kiếm
2. Click **"+ New registration"**
3. Điền thông tin:
   - **Name**: `OneDrive Personal App` (hoặc tên bất kỳ)
   - **Supported account types**: Chọn **"Personal Microsoft accounts only"**
     - Nếu bạn muốn hỗ trợ cả Business accounts, chọn "Multitenant + Personal"
   - **Redirect URI**: 
     - Platform: **Web**
     - URI: `http://localhost:8081/auth/callback`
4. Click **"Register"**

### Bước 1.3: Lưu Application (Client) ID
1. Sau khi tạo xong, bạn sẽ thấy trang **Overview**
2. Copy **Application (client) ID** (dạng `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
3. Lưu lại để dùng sau

---

## Phần 2: Cấu Hình Authentication

### Bước 2.1: Thêm Redirect URIs
1. Vào menu **Authentication** (bên trái)
2. Trong phần **Redirect URIs**, đảm bảo có:
   - `http://localhost:8081/auth/callback`
3. Nếu bạn muốn truy cập qua IP LAN, **KHÔNG THỂ** thêm `http://192.168.x.x` (Microsoft không cho phép)
   - Giải pháp: Chỉ dùng `localhost` hoặc setup HTTPS

### Bước 2.2: Bật Implicit Grant (Quan trọng!)
1. Vẫn ở trang **Authentication**
2. Kéo xuống phần **Implicit grant and hybrid flows**
3. Tick vào:
   - ✅ **Access tokens** (used for implicit flows)
   - ✅ **ID tokens** (used for implicit and hybrid flows)
4. Click **Save** ở trên cùng

---

## Phần 3: Cấu Hình API Permissions

### Bước 3.1: Thêm Delegated Permissions
1. Vào menu **API permissions** (bên trái)
2. Click **"+ Add a permission"**
3. Chọn **Microsoft Graph**
4. Chọn **Delegated permissions** (KHÔNG PHẢI Application permissions)
5. Tìm và tick các permissions sau:
   - ✅ `Files.ReadWrite` (hoặc `Files.ReadWrite.All` nếu cần)
   - ✅ `offline_access` (để có refresh token)
   - ✅ `User.Read` (thường có sẵn)
6. Click **Add permissions**

### Bước 3.2: Xóa Application Permissions (Nếu Có)
- Nếu bạn thấy các permissions có Type = **Application**, hãy xóa chúng đi
- Chỉ giữ lại **Delegated permissions**

### Lưu Ý:
- **KHÔNG CẦN** Admin Consent cho Delegated permissions với Personal accounts
- Nếu dùng Business account, có thể cần Admin Consent

---

## Phần 4: Tạo Client Secret

### Bước 4.1: Tạo Secret
1. Vào menu **Certificates & secrets** (bên trái)
2. Tab **Client secrets** → Click **"+ New client secret"**
3. Điền:
   - **Description**: `OneDrive Secret` (hoặc tên bất kỳ)
   - **Expires**: Chọn thời gian hết hạn (khuyến nghị: 24 months)
4. Click **Add**

### Bước 4.2: Copy Secret Value (QUAN TRỌNG!)
1. Sau khi tạo, bạn sẽ thấy 2 cột:
   - **Secret ID**: Dạng GUID (KHÔNG DÙNG cái này)
   - **Value**: Chuỗi ký tự dài (VÍ DỤ: `abc~123...`)
2. **Copy cột "Value" NGAY LẬP TỨC** (chỉ hiện 1 lần duy nhất!)
3. Nếu bạn refresh trang, Value sẽ bị ẩn mãi mãi
4. Lưu lại để dùng sau

---

## Phần 5: Cấu Hình OneDrive Desktop Sync

### Bước 5.1: Cài Đặt OneDrive Desktop Client
1. Nếu chưa có, tải OneDrive Desktop từ [Microsoft](https://www.microsoft.com/en-us/microsoft-365/onedrive/download)
2. Cài đặt và đăng nhập bằng tài khoản Microsoft của bạn

### Bước 5.2: Tìm Đường Dẫn OneDrive Local
1. Mở File Explorer
2. Tìm folder **OneDrive** (thường ở `C:\Users\<YourName>\OneDrive`)
3. Copy đường dẫn đầy đủ (ví dụ: `C:\Users\pc\OneDrive`)

### Bước 5.3: Tạo Folder `uploads` trong OneDrive
1. Vào folder OneDrive (`C:\Users\pc\OneDrive`)
2. Tạo folder mới tên `uploads`
3. Đường dẫn đầy đủ: `C:\Users\pc\OneDrive\uploads`

### Bước 5.4: Sync Folder Uploads của Project
Có 2 cách:

#### Cách A: Copy/Move Folder (Đơn giản)
1. Copy toàn bộ nội dung từ `E:\RAG\Preview_folder\uploads` 
2. Paste vào `C:\Users\pc\OneDrive\uploads`
3. Từ nay, làm việc trực tiếp trên `C:\Users\pc\OneDrive\uploads`

#### Cách B: Symbolic Link (Nâng cao)
```powershell
# Chạy PowerShell as Administrator
mklink /D "C:\Users\pc\OneDrive\uploads" "E:\RAG\Preview_folder\uploads"
```
Lưu ý: Cách này có thể gặp vấn đề với OneDrive sync.

**Khuyến nghị:** Dùng Cách A (Copy/Move)

---

## Phần 6: Cấu Hình File `.env`

### Bước 6.1: Tạo File `.env`
1. Mở project folder: `E:\RAG\Preview_folder`
2. Tạo file mới tên `.env` (nếu chưa có)

### Bước 6.2: Điền Thông Tin
```env
# OneDrive / Microsoft Graph API Configuration
ONEDRIVE_TENANT_ID=consumers
ONEDRIVE_CLIENT_ID=<YOUR_CLIENT_ID_HERE>
ONEDRIVE_CLIENT_SECRET=<YOUR_CLIENT_SECRET_VALUE_HERE>
ONEDRIVE_REDIRECT_URI=http://localhost:8081/auth/callback

# Server Configuration
PORT=8081
```

**Thay thế:**
- `<YOUR_CLIENT_ID_HERE>`: Application (client) ID từ Bước 1.3
- `<YOUR_CLIENT_SECRET_VALUE_HERE>`: Secret Value từ Bước 4.2

**Lưu ý:**
- `ONEDRIVE_TENANT_ID=consumers` cho Personal accounts
- Nếu dùng Business account, đổi thành `common` hoặc Tenant ID thật

### Bước 6.3: Kiểm Tra `.gitignore`
Đảm bảo file `.gitignore` có dòng:
```
.env
```
Để không commit thông tin nhạy cảm lên Git.

---

## Phần 7: Test Hệ Thống

### Bước 7.1: Restart Server
```bash
# Nếu dùng nodemon, nó sẽ tự restart
# Hoặc restart thủ công:
npm run dev
```

Kiểm tra log, phải thấy:
```
✅ OneDrive OAuth Service initialized
```

### Bước 7.2: Đăng Nhập Lần Đầu
1. Mở trình duyệt, vào `http://localhost:8081`
2. Chọn một extraction có file Excel
3. Click vào file Excel để xem preview
4. Bấm nút **"Edit Online"** (màu xanh dương)
5. Popup hiện ra hỏi: "Bạn cần đăng nhập OneDrive lần đầu tiên. Tiếp tục?" → Bấm **OK**
6. Cửa sổ mới mở ra → Trang đăng nhập Microsoft
7. Đăng nhập bằng tài khoản của bạn
8. Microsoft hỏi: "Cho phép App này truy cập OneDrive?" → Bấm **Accept/Đồng ý**
9. Cửa sổ hiển thị "✅ Đăng nhập thành công!" và tự đóng sau 2 giây

### Bước 7.3: Sử Dụng Tính Năng
1. Quay lại trang chính
2. Bấm lại nút **"Edit Online"**
3. Lần này:
   - Nút hiển thị "Loading..."
   - Server tìm file trên OneDrive (đã sync)
   - Tab mới mở ra với link Excel edit (dạng `https://1drv.ms/x/...`)
4. Chỉnh sửa file trên OneDrive Web
5. Lưu lại
6. OneDrive tự động sync về local (`C:\Users\pc\OneDrive\uploads`)

---

## Phần 8: Chia Sẻ Folder Cho Người Khác

### Bước 8.1: Chia Sẻ Trên OneDrive Web
1. Vào [OneDrive Web](https://onedrive.live.com)
2. Tìm folder `uploads`
3. Click chuột phải → **Share** (Chia sẻ)
4. Nhập email của người bạn muốn chia sẻ
5. Chọn quyền: **Can edit** (Có thể chỉnh sửa)
6. Gửi lời mời

### Bước 8.2: Người Được Chia Sẻ
1. Nhận email mời → Click vào link
2. Folder `uploads` xuất hiện trong OneDrive của họ (mục "Shared with me")
3. Họ có thể:
   - Xem tất cả file
   - Chỉnh sửa file Excel online
   - Tải về
   - Thêm/xóa file (nếu có quyền edit)

---

## Phần 9: Troubleshooting

### Lỗi: "unauthorized_client"
**Nguyên nhân:** App Registration cấu hình sai "Supported account types"

**Giải pháp:**
1. Vào Azure Portal → App Registration → **Authentication**
2. Đổi "Supported account types" thành **"Personal Microsoft accounts only"**
3. Đảm bảo file `.env` có `ONEDRIVE_TENANT_ID=consumers`
4. Restart server

### Lỗi: "invalid_client" hoặc "Invalid client secret"
**Nguyên nhân:** Client Secret sai hoặc hết hạn

**Giải pháp:**
1. Vào Azure Portal → App Registration → **Certificates & secrets**
2. Tạo **New client secret**
3. Copy **Value** (không phải Secret ID!)
4. Update file `.env` với giá trị mới
5. Restart server

### Lỗi: "Insufficient privileges"
**Nguyên nhân:** Thiếu API permissions

**Giải pháp:**
1. Vào Azure Portal → App Registration → **API permissions**
2. Đảm bảo có **Delegated permissions**: `Files.ReadWrite`, `offline_access`
3. Xóa các **Application permissions** nếu có
4. Thử lại

### Lỗi: "File not synced to OneDrive yet"
**Nguyên nhân:** OneDrive Desktop Client chưa sync xong

**Giải pháp:**
1. Kiểm tra OneDrive Desktop Client (icon trên system tray)
2. Đợi sync hoàn tất (icon ngừng quay)
3. Thử lại sau vài giây

### Lỗi: "No authorization code received"
**Nguyên nhân:** Redirect URI không khớp

**Giải pháp:**
1. Kiểm tra file `.env`: `ONEDRIVE_REDIRECT_URI=http://localhost:8081/auth/callback`
2. Kiểm tra Azure Portal → **Authentication** → Redirect URIs phải có `http://localhost:8081/auth/callback`
3. **PHẢI** truy cập qua `http://localhost:8081` (không dùng IP LAN)
4. Restart server

---

## Phần 10: Bảo Mật

### Các Lưu Ý Quan Trọng:
1. ✅ File `.env` **KHÔNG BAO GIỜ** commit lên Git
2. ✅ Client Secret phải được bảo mật tuyệt đối
3. ✅ Chỉ cấp quyền tối thiểu cần thiết (`Files.ReadWrite`, không dùng `Files.ReadWrite.All` nếu không cần)
4. ✅ Định kỳ rotate Client Secret (mỗi 6-12 tháng)
5. ✅ Nếu Secret bị lộ, xóa ngay và tạo mới

### Token Cache:
- File `.onedrive-token-cache.json` chứa Access Token
- File này cũng nên được gitignore
- Nếu muốn logout, xóa file này và restart server

---

## Phần 11: Kiến Trúc Kỹ Thuật

### Flow Đăng Nhập (OAuth 2.0 Authorization Code Flow):
```
1. User bấm "Edit Online"
2. Frontend gọi API: POST /api/open-onedrive
3. Backend check: isAuthenticated()?
   - Nếu NO → Trả về { requireAuth: true, authUrl: '/auth/login' }
4. Frontend mở popup: /auth/login
5. Backend redirect đến Microsoft Login
6. User đăng nhập và cho phép
7. Microsoft redirect về: /auth/callback?code=xxx
8. Backend dùng code để lấy Access Token + Refresh Token
9. Lưu token vào file .onedrive-token-cache.json
10. Popup đóng
11. Frontend tự động retry: POST /api/open-onedrive
12. Backend check: isAuthenticated() → YES
13. Backend tìm file trên OneDrive (qua Graph API)
14. Backend tạo Edit Link
15. Frontend mở link trong tab mới
```

### Graph API Endpoints Sử dụng:
- `GET /me/drive/root:/uploads/{path}` - Tìm file
- `POST /me/drive/items/{itemId}/createLink` - Tạo link edit

---

## Phần 12: Nâng Cao

### Tự Động Refresh Token:
Code đã tự động refresh token khi hết hạn. Access Token thường có thời hạn 1 giờ.

### Multi-User Support:
Hiện tại, token được lưu chung cho toàn server. Nếu muốn mỗi user có token riêng:
1. Cần thêm hệ thống login/session
2. Lưu token theo user ID
3. Phức tạp hơn nhiều

### HTTPS cho Production:
Nếu deploy lên server thật:
1. Dùng domain có SSL (ví dụ: `https://myapp.com`)
2. Update Redirect URI trên Azure: `https://myapp.com/auth/callback`
3. Update file `.env`: `ONEDRIVE_REDIRECT_URI=https://myapp.com/auth/callback`

---

## Tổng Kết

Bạn đã hoàn thành thiết lập tính năng "Edit Online" với OneDrive! 🎉

**Checklist Cuối Cùng:**
- ✅ Azure App Registration đã tạo
- ✅ Redirect URI: `http://localhost:8081/auth/callback`
- ✅ Supported account types: Personal Microsoft accounts only
- ✅ API Permissions: Files.ReadWrite, offline_access (Delegated)
- ✅ Client Secret đã tạo và lưu vào `.env`
- ✅ OneDrive Desktop Client đang sync folder `uploads`
- ✅ File `.env` đã cấu hình đầy đủ
- ✅ Server chạy thành công, có log "OneDrive OAuth Service initialized"
- ✅ Đã đăng nhập thành công lần đầu
- ✅ Tính năng "Edit Online" hoạt động

**Liên Hệ Hỗ Trợ:**
Nếu gặp vấn đề, hãy kiểm tra:
1. Log của server (terminal)
2. Console của trình duyệt (F12)
3. Phần Troubleshooting ở trên

Chúc bạn sử dụng hiệu quả! 🚀
