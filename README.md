# PAMS - Kiểm thử tự động

Bộ kiểm thử cho backend PAMS, gọi qua API Gateway. Gồm hai công cụ:

| Công cụ        | Kiểm tra gì                                                          | Thư mục  |
| -------------- | -------------------------------------------------------------------- | -------- |
| **Playwright** | Chức năng và bảo mật (đăng nhập, phân quyền, upload, mốc tiến trình) | `tests/` |
| **k6**         | Hiệu năng (tải), luồng nghiệp vụ, rate limit                         | `k6/`    |

## 1. Chuẩn bị

Cần: **Node.js 18+** (cho Playwright) và **k6** (https://grafana.com/docs/k6/latest/set-up/install-k6/).

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Điền `.env` (không commit file này):

| Biến                         | Ý nghĩa                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `BASE_URL`                   | Địa chỉ API cho Playwright, **có `/api/v1/` và dấu `/` cuối**. Ví dụ: `https://<gateway>.onrender.com/api/v1/` |
| `NCS_USER`, `NCS_PASS`       | Tài khoản nghiên cứu sinh                                                                                      |
| `GVHD_USER`, `GVHD_PASS`     | Tài khoản giảng viên hướng dẫn                                                                                 |
| `GIAOVU_USER`, `GIAOVU_PASS` | Tài khoản giáo vụ                                                                                              |
| `DOC_ID_OF_OTHER_NCS`        | (Tùy chọn) ID tài liệu của NCS khác, cho TC16. Bỏ trống thì TC16 tự bỏ qua                                     |

> **Chú ý:** k6 dùng `BASE_URL` **không có `/api/v1`** (chỉ gốc gateway, ví dụ `https://<gateway>.onrender.com`) và nhận qua `-e`, không đọc `.env`.

---

## 2. Playwright: chức năng và bảo mật

| File                  | Test case                    | Kiểm tra                                                             |
| --------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `01-auth.spec.ts`     | TC01, TC02, TC05, TC06       | Đăng nhập đúng/sai, làm mới token, phát hiện dùng lại token cũ       |
| `02-rbac.spec.ts`     | TC11, TC12, TC13, TC16, TC18 | Không token, token bị sửa, sai vai trò, truy cập tài liệu người khác |
| `03-upload.spec.ts`   | TC49, TC50, TC51, TC52       | PDF hợp lệ, đúng 15MB, vượt 15MB 1 byte, file giả đuôi `.pdf`        |
| `04-progress.spec.ts` | TC21                         | Nộp mốc 3 khi mốc 2 chưa đạt phải bị từ chối                         |

Tổng 14 test, 11 test case (đặt tên theo mã trong file Excel để đối chiếu).

```bash
npm test                # chạy tất cả
npm run test:auth       # từng nhóm: auth, rbac, upload, progress
npm run report          # mở báo cáo HTML
```

Kết quả: `playwright-report/` (báo cáo HTML, dùng làm bằng chứng) và `test-results/results.json`.

Lưu ý: TC06 chờ 16 giây, TC50/TC51 upload file 15MB nên chậm. Gặp HTTP 429 thì chạy từng nhóm và chờ 60 giây giữa các lần.

---

## 3. k6: tải, luồng nghiệp vụ, rate limit

| File            | Câu hỏi                                            | Chạy lại được?            |
| --------------- | -------------------------------------------------- | ------------------------- |
| `load-read.js`  | Nhiều người cùng đọc thì server có chịu nổi không? | Có                        |
| `flow-write.js` | Cả luồng nộp, chấm, duyệt mốc có đúng không?       | Không, phải reset dữ liệu |
| `rate-limit.js` | Đăng nhập sai nhiều lần có bị chặn đúng không?     | Có                        |

### 3.1 Đọc dữ liệu (`load-read.js`)

```bash
k6 run -e BASE_URL=https://<gateway>.onrender.com \
      -e NCS_USER=... -e NCS_PASS=... -e VUS=30 k6/load-read.js
```

1. Đăng nhập 1 lần bằng tài khoản NCS, dùng chung token cho tất cả VUs.
2. Tăng dần lên `VUS` người dùng ảo trong 30 giây, giữ tải 2 phút, sau đó giảm về 0 trong 30 giây.
3. Mỗi VU liên tục gọi 3 API đọc dữ liệu: `progress/me`, `ncs/me`, `notifications` (chỉ GET).
4. Mỗi iteration nghỉ 20 giây (`sleep(20)`) để điều tiết tốc độ request, tránh vượt giới hạn 100 lần/phút/user.
5. Không gọi `/ping` trong vòng lặp do API này có giới hạn 10 lần/phút/IP.

**Đạt khi:** ≥95% check thành công, <5% request lỗi, P95 response time <1 giây.

### 3.2 Luồng nghiệp vụ (`flow-write.js`)

```bash
k6 run -e BASE_URL=https://<gateway>.onrender.com \
       -e NCS_USER=... -e NCS_PASS=... \
       -e GV_USER=... -e GV_PASS=... k6/flow-write.js
```

1. Đăng nhập NCS và giảng viên.
2. NCS upload PDF minh chứng, nộp cho mốc.
3. Giảng viên chấm 3 phiếu, tạo quyết định, duyệt mốc.
4. NCS xem thông báo và tiến trình mới.

**Đạt khi:** mọi bước trả 200/201.

> Mỗi tài khoản chỉ chạy được 1 lần (mốc đã nộp không nộp lại được). Chạy lại thì reset dữ liệu, hoặc đổi mốc: `-e THU_TU=3`. Biến tùy chọn khác: `SO_PHIEU` (số phiếu chấm, mặc định 3).

### 3.3 Rate limit đăng nhập (`rate-limit.js`)

```bash
k6 run -e BASE_URL=https://<gateway>.onrender.com k6/rate-limit.js
```

Quy tắc kiểm tra: **đăng nhập tối đa 5 lần/phút cho mỗi username**, vượt thì trả 429. Dùng username giả nên không khóa nhầm tài khoản thật.

1. Đăng nhập sai 5 lần → 401 (chưa bị chặn).
2. Lần thứ 6 → 429 (bị chặn).
3. Cùng username viết HOA → vẫn 429 (không phân biệt hoa/thường).
4. Username khác → vẫn 401 (mỗi username có bộ đếm riêng).
5. Chờ 65 giây → thử lại → 401 (hết bị chặn).

**Đạt khi:** tất cả check đúng. Bài này mất khoảng 70 giây.

### 3.4 Đọc kết quả k6

| Chỉ số                    | Ý nghĩa                       |
| ------------------------- | ----------------------------- |
| `checks`                  | Tỉ lệ kiểm tra đúng           |
| `http_req_duration` (p95) | 95% request nhanh hơn mức này |
| `http_req_failed`         | Tỉ lệ request lỗi             |
| `✓` / `✗`                 | Ngưỡng đạt / không đạt        |

---

## 4. Lưu ý chung

- Chạy từng bài riêng, không chạy cùng lúc: rate limit tính theo IP và tài khoản nên các bài làm nhiễu nhau.
- Server Render free tier ngủ đông: lần gọi đầu có thể chậm. k6 tự gọi `ping` làm nóng server trước khi đo.
- Token sống 15 phút, test k6 chạy lâu hơn thì phải đăng nhập lại.
- Tài khoản mới có thể bị buộc đổi mật khẩu (`mustChangePassword`), hãy đổi trước khi dùng.
- Chỉ chạy trên môi trường dev/test, không chạy trên production.

## 5. Cấu trúc

```
tests/                 test Playwright (01 đến 04)
helpers/api.ts         hàm dùng chung: login, upload, tạo file PDF giả
type/auth.ts           kiểu dữ liệu đăng nhập
playwright.config.ts   cấu hình Playwright
k6/lib/common.js       hàm dùng chung của k6: login, warmup
k6/load-read.js        test tải đọc
k6/flow-write.js       test luồng nghiệp vụ
k6/rate-limit.js       test rate limit đăng nhập
sample/sample.pdf      PDF mẫu cho bước upload
.env.example           mẫu cấu hình
```
