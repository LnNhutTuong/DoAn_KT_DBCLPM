import { test, expect } from '@playwright/test';
import { findKey, loginOk, makePdf, safeJson, sha256, upload } from '../helpers/api';

const MB15 = 15 * 1024 * 1024;

test.describe('SC08 - Upload và quản lý tài liệu PDF', () => {
  test('TC49 - Upload PDF hợp lệ', async ({ request }) => {
    const { accessToken } = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    const pdf = makePdf(1024 * 1024);
    const res = await upload(request, accessToken, { buffer: pdf });
    expect(res.status()).toBeLessThan(300);

    const body = await safeJson(res);
    expect(findKey(body, 'status')).toBe('ACTIVE');
    const checksum = findKey(body, 'checksum');
    if (checksum) expect(String(checksum).toLowerCase()).toBe(sha256(pdf));
  });

  test('TC50 - Upload file PDF đúng 15MB (biên)', async ({ request }) => {
    test.setTimeout(90_000);
    const { accessToken } = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    const res = await upload(request, accessToken, { buffer: makePdf(MB15) });
    expect(res.status()).toBeLessThan(300);
  });

  test('TC51 - Upload file PDF vượt 15MB 1 byte', async ({ request }) => {
    test.setTimeout(90_000);
    const { accessToken } = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    const res = await upload(request, accessToken, { buffer: makePdf(MB15 + 1) });
    expect([400, 413]).toContain(res.status());
  });

  test('TC52 - Upload file giả mạo đuôi .pdf (sai chữ ký)', async ({ request }) => {
    const { accessToken } = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    // Nội dung bắt đầu bằng "MZ" (file thực thi Windows), không phải %PDF-
    const fake = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 0x41)]);
    const res = await upload(request, accessToken, { buffer: fake, filename: 'test.pdf' });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
