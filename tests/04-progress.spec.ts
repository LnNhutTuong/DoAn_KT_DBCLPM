import { test, expect } from '@playwright/test';
import { bearer, loginOk, makePdf, p, upload, findKey, safeJson } from '../helpers/api';

test.describe('SC04 - Nộp và xét duyệt mốc tiến trình', () => {
  test('TC21 - NCS nộp mốc 3 khi mốc 2 chưa đạt', async ({ request }) => {
    // Dùng NCS mới: mốc 3 đang LOCKED
    const { accessToken } = await loginOk(request, 'NCS_NEW_USER', 'NCS_NEW_PASS');

    // Chuẩn bị một tài liệu hợp lệ để loại trừ lỗi do file
    const up = await upload(request, accessToken, { buffer: makePdf(64 * 1024) });
    expect(up.status()).toBeLessThan(300);
    const documentId = findKey(await safeJson(up), 'id');

    // TODO: đối chiếu tên trường body với DTO thật (ví dụ documentId / documentIds)
    const res = await request.post(p('progress/milestones/3/submit'), {
      headers: bearer(accessToken),
      data: { documentId },
    });
    expect(res.status(), 'nộp mốc đang LOCKED phải bị từ chối').toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
