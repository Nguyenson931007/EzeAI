# EzeFloor Frontend

Frontend chính của EzeFloor, sử dụng Next.js 16 và React 19.

Hướng dẫn cài đặt đầy đủ cho cả backend, frontend, `.env` và AI models nằm trong [README của repository](../README.md).

## Chạy development

Backend phải đang chạy tại `http://127.0.0.1:8090`. Sau đó mở terminal tại thư mục này:

```powershell
npm install
npm run dev
```

Mở <http://127.0.0.1:3011/> hoặc <http://localhost:3011/>.

Frontend đọc cấu hình từ file `.env` ở thư mục gốc repository, không tạo `frontend_next/.env.local`.

## Build production

```powershell
npm run build
npm run start
```

Lệnh `start` chạy ứng dụng production ở cổng `3011`.
