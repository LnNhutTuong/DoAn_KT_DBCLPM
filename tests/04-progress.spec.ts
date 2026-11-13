import { test, expect } from '@playwright/test';
import { bearer, loginOk, makePdf, p, upload, findKey, safeJson } from '../helpers/api';

test.describe('SC04 - Nộp và xét duyệt mốc tiến trình', () => {
  test('TC21 - NCS nộp mốc 3 khi mốc 2 chưa đạt', async ({ request }) => {
    test.setTimeout(300_000);
    const { access_token } = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    const up = await upload(request, access_token, { buffer: makePdf(64 * 1024) });
    expect(up.status()).toBeLessThan(300);
    const documentId = findKey(await safeJson(up), 'id');

    const res = await request.post(p('progress/milestones/3/submit'), {
      headers: bearer(access_token),
      data: { documentId },
    });
    expect(res.status(), 'nộp mốc đang LOCKED phải bị từ chối').toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
