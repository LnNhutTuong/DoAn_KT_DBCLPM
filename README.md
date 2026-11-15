# PAMS - Kiểm thử tự động

Bộ kiểm thử API backend PAMS qua API Gateway, gồm Playwright cho chức năng/bảo mật và k6 cho tải, stress và giới hạn đăng nhập.

| Công cụ | Kiểm tra | Thư mục |
| --- | --- | --- |
| Playwright | Đăng nhập, refresh token, phân quyền, upload tài liệu, mốc tiến trình | `tests/` |
| k6 | Tải đọc dữ liệu, stress đọc dữ liệu, rate limit đăng nhập | `k6/` |

## 1. Chuẩn bị

Cần Node.js 18+ và k6 ([hướng dẫn cài k6](https://grafana.com/docs/k6/latest/set-up/install-k6/)).

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Điền `.env` (không commit file này):

| Biến | Ý nghĩa |
| --- | --- |
| `BASE_URL` | URL API cho Playwright, có `/api/v1/` và dấu `/` cuối, ví dụ `https://<gateway>.onrender.com/api/v1/` |
| `NCS_USER`, `NCS_PASS` | Tài khoản nghiên cứu sinh dùng kiểm thử |
| `GVHD_USER`, `GVHD_PASS` | Tài khoản giảng viên hướng dẫn |
| `GIAOVU_USER`, `GIAOVU_PASS` | Tài khoản giáo vụ |
| `DOC_ID_OF_OTHER_NCS` | Tùy chọn; ID tài liệu của NCS khác cho TC16. Nếu để trống, TC16 tự bỏ qua. |

> k6 dùng `BASE_URL` khác Playwright: chỉ URL gốc gateway, không có `/api/v1`, và truyền bằng `-e` khi chạy. Các script k6 không đọc `.env`.

---

## 2. Playwright: chức năng và bảo mật

| File | Test case | Nội dung |
| --- | --- | --- |
| `01-auth.spec.ts` | TC01, TC02, TC05, TC06 | Đăng nhập đúng/sai, refresh token, phát hiện dùng lại refresh token cũ và thu hồi phiên |
| `02-rbac.spec.ts` | TC11, TC12, TC13, TC16, TC18 | Không token, token bị sửa, sai vai trò, IDOR tài liệu, quyền truy cập audit log |
| `03-upload.spec.ts` | TC49, TC50, TC51, TC52 | PDF hợp lệ, giới hạn 15 MB, vượt giới hạn 1 byte, file giả đuôi `.pdf` |
| `04-progress.spec.ts` | TC21 | Từ chối nộp mốc 3 khi mốc 2 chưa đạt |

Tổng cộng 14 test. TC16 được skip nếu chưa cấu hình `DOC_ID_OF_OTHER_NCS`.

```bash
npm test                # chạy toàn bộ test
npm run test:auth       # nhóm đăng nhập
npm run test:rbac       # nhóm phân quyền
npm run test:upload     # nhóm upload
npm run test:progress   # nhóm tiến trình
npm run typecheck      # kiểm tra TypeScript
npm run report          # mở báo cáo HTML gần nhất
```

Kết quả được lưu tại `playwright-report/` (HTML), `test-results/results.json`; ảnh chụp và trace được lưu khi test lỗi. Cấu hình hiện chạy tuần tự với một worker. TC06 chờ 16 giây để vượt grace period; các test upload tạo file kiểm thử trước khi chạy và xóa sau đó. Các lệnh tạo file ở `03-upload.spec.ts` dùng tiện ích shell kiểu Unix (`printf`, `truncate`, `dd`); trên Windows hãy chạy trong WSL hoặc môi trường tương thích.

---

## 3. k6: tải, stress và rate limit

| Script | Mục đích | Ghi chú |
| --- | --- | --- |
| `load-read.js` | Tải nhiều VU đọc dữ liệu | Có thể chạy lại; mặc định `VUS=30`, giữ tải `HOLD=2m` |
| `stress-read.js` | Tăng tải đọc theo các giai đoạn để quan sát phản hồi và 429 | Cần ba tài khoản NCS; tải tối đa 300 VU theo cấu hình hiện tại |
| `rate-limit.js` | Kiểm tra giới hạn đăng nhập sai | Dùng username giả; mặc định mất khoảng 70 giây |

### 3.1 Tải đọc (`load-read.js`)

```bash
k6 run -e BASE_URL=https://<gateway>.onrender.com \
       -e NCS_USER=... -e NCS_PASS=... \
       -e VUS=30 -e HOLD=2m k6/load-read.js
```

- Làm nóng server, đăng nhập một lần bằng tài khoản NCS và dùng token đó cho các VU.
- Mặc định ramp-up 30 giây, giữ tải 2 phút (`HOLD` tùy chỉnh được), rồi ramp-down 30 giây.
- Mỗi vòng gọi `GET /api/v1/progress/me`, `GET /api/v1/ncs/me` và `GET /api/v1/notifications`, sau đó nghỉ 20 giây.
- Ngưỡng đặt trong script: checks >95%, request lỗi <5%, P95 thời gian phản hồi dưới 1 giây.

### 3.2 Stress đọc (`stress-read.js`)

```bash
k6 run -e BASE_URL=https://<gateway>.onrender.com \
       -e NCS_PASS=... k6/stress-read.js
```

Script đăng nhập ba tài khoản NCS một lần trong giai đoạn setup, rồi phân phối VU luân phiên giữa ba token. Mặc định tài khoản là `ncs014`, `ncs016`, `ncs017`; có thể đổi username bằng `USER_014`, `USER_015`, `USER_017`. Mật khẩu chung lấy từ `NCS_PASS` (mặc định trong script là `123456`). Hãy dùng tài khoản test được cấp và đặt mật khẩu phù hợp bằng biến môi trường.

Tải lần lượt tăng lên 100 VU trong 1 phút, 200 VU trong 1 phút, giữ 300 VU trong 2 phút, rồi giảm về 0 trong 30 giây. Mỗi VU gọi ba API đọc như ở bài tải và nghỉ 1 giây giữa các vòng. Script ghi nhận riêng response 200 và 429; ngưỡng hiện tại là request lỗi <5% và P95 dưới 2 giây. Chạy trên môi trường dev/test với tài khoản được phép tạo tải; 429 cho biết rate limit đã kích hoạt, không phải phản hồi thành công của API.

### 3.3 Rate limit đăng nhập (`rate-limit.js`)

```bash
k6 run -e BASE_URL=https://<gateway>.onrender.com k6/rate-limit.js
```

Mặc định kiểm tra giới hạn 5 lần đăng nhập/phút/username. Dùng username giả có mã chạy riêng, không dùng tài khoản thật. Có thể tùy chỉnh bằng `LIMIT` và `WINDOW_SEC`.

1. `LIMIT` lần đầu phải trả 401.
2. Lần `LIMIT + 1` và username viết HOA phải trả 429.
3. Username giả khác phải trả 401, xác minh bộ đếm riêng theo username.
4. Sau khi chờ hết cửa sổ cộng 5 giây, username ban đầu phải trả 401.

Bài test có thể chờ hơn một phút để kiểm tra cửa sổ rate limit.

### 3.4 Chỉ số k6

| Chỉ số | Ý nghĩa |
| --- | --- |
| `checks` | Tỷ lệ các điều kiện kiểm tra đúng |
| `http_req_duration` | Thời gian phản hồi; `p(95)` là ngưỡng P95 |
| `http_req_failed` | Tỷ lệ request được k6 tính là lỗi |
| `successful_200`, `rate_limited_429` | Bộ đếm riêng trong bài stress cho response 200 và 429 |

---

## 4. Lưu ý

- Chạy từng bài riêng để các bài kiểm thử không làm nhiễu nhau qua rate limit theo IP/tài khoản.
- `load-read.js` dùng chung một token cho mọi VU; điều chỉnh `VUS` phù hợp với giới hạn môi trường kiểm thử.
- Server Render free tier có thể ngủ đông; các bài k6 gọi `/api/v1/ping` để warmup trước khi chạy.
- Token có thời hạn; dùng tài khoản test hợp lệ và đổi mật khẩu trước nếu hệ thống yêu cầu (`mustChangePassword`).
- Chỉ chạy các bài kiểm thử này trên môi trường dev/test, không chạy trên production.

## 5. Cấu trúc chính

```text
.env.example           mẫu cấu hình Playwright
helpers/api.ts         helper API dùng chung cho Playwright
playwright.config.ts   cấu hình Playwright, báo cáo và timeout
tests/01-auth.spec.ts  test đăng nhập và refresh token
tests/02-rbac.spec.ts  test phân quyền
tests/03-upload.spec.ts test upload tài liệu
tests/04-progress.spec.ts test nộp mốc tiến trình
k6/lib/common.js       helper k6: login và warmup
k6/load-read.js        test tải đọc dữ liệu
k6/stress-read.js      test stress đọc dữ liệu
k6/rate-limit.js       test rate limit đăng nhập
type/auth.ts           kiểu dữ liệu xác thực
sample/                dữ liệu mẫu trong repo
```
