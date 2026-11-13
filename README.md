# PAMS API Tests (Playwright + TypeScript)

Automation test cho Backend PAMS qua api-gateway. Không cần trình duyệt, chỉ dùng `request` API của Playwright.
Mỗi test đặt tên theo mã trong file Excel (TC01, TC02, ...) để đối chiếu trực tiếp với sheet Execution.

## Cài đặt và chạy

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# điền BASE_URL (có dấu / cuối) và tài khoản test vào .env
npm test                    # chạy tất cả
npm run test:auth           # chạy từng nhóm: auth, rbac, upload, progress
npm run report              # mở báo cáo HTML
```

Kết quả: `playwright-report/` (HTML, dùng làm bằng chứng nộp) và `test-results/results.json`.

## Test đã có (14 test, 11 test case trong file Excel)

| File | Test case |
|---|---|
| 01-auth.spec.ts | TC01, TC02, TC05, TC06 |
| 02-rbac.spec.ts | TC11, TC12, TC13, TC16 (cần DOC_ID_OF_OTHER_NCS), TC18 |
| 03-upload.spec.ts | TC49, TC50, TC51, TC52 |
| 04-progress.spec.ts | TC21 (cần tài khoản NCS mới NCS_NEW_USER) |

TC06 chờ 16 giây (grace period của refresh token), TC50/TC51 upload file 15MB nên chậm hơn.

## Việc cần đối chiếu trước khi chạy lần đầu

1. **Tên trường request/response** trong `tests/helpers/api.ts`: `username`, `password`, `refreshToken`, `file`, `documentType`. Sai thì chỉnh một chỗ ở đây.
2. **Body nộp mốc** trong `04-progress.spec.ts` (đang là `{ documentId }`), xem DTO thật.
3. **Mã lỗi mong đợi** (401/403/400/413): nếu hệ thống trả mã khác nhưng hợp lý, sửa test chứ đừng vội ghi bug.
4. **Rate-limit** của gateway: nếu gặp HTTP 429, chạy từng file hoặc tăng giới hạn ở môi trường test.
5. Tài khoản NCS mới có thể bị buộc đổi mật khẩu (`mustChangePassword`); đổi mật khẩu trước khi đưa vào `.env`.

## Muốn thêm test (ứng viên trong file Excel)

TC20, TC23 (nộp và duyệt mốc), TC34 (định mức TS), TC40 (phân công đồng thời bằng `Promise.all`), TC48 (phê duyệt gia hạn). Các test này cần dữ liệu NCS/GVHD đã dựng sẵn theo đúng trạng thái.
