import { test, expect } from '@playwright/test';
import { bearer, env, login, loginOk, p, safeJson, findKey } from '../helpers/api';

test.describe('SC01 - Đăng nhập, đăng xuất, làm mới token', () => {
  test('TC01 - Đăng nhập thành công với tài khoản hợp lệ', async ({ request }) => {
    const r = await login(request, env('NCS_USER'), env('NCS_PASS'));
    expect(r.status).toBeLessThan(300);
    expect(r.access_token, 'phải có access_token').toBeTruthy();
    expect(r.refresh_token, 'phải có refresh_token').toBeTruthy();

    const me = await request.get(p('auth/me'), { headers: bearer(r.access_token!) });
    expect(me.status()).toBe(200);
  });

  test('TC02 - Đăng nhập thất bại: sai mật khẩu hoặc username không tồn tại', async ({ request }) => {
    const wrongPass = await login(request, env('NCS_USER'), 'Sai_Mat_Khau_123!');
    const noUser = await login(request, 'khong_ton_tai_999', 'Sai_Mat_Khau_123!');

    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPass.access_token).toBeUndefined();
    expect(noUser.access_token).toBeUndefined();

    // Không lộ username có tồn tại hay không: thông báo lỗi phải giống nhau
    const m1 = findKey(wrongPass.body, 'message');
    const m2 = findKey(noUser.body, 'message');
    expect(m1).toEqual(m2);
  });

  test('TC05 - Refresh token hợp lệ cấp cặp token mới', async ({ request }) => {
    const first = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    const res = await request.post(p('auth/refresh'), { data: { refreshToken: first.refresh_token } });
    expect(res.status()).toBeLessThan(300);
    const body = await safeJson(res);
    const newAccess = findKey(body, 'access_token');
    const newRefresh = findKey(body, 'refresh_token');
    expect(newAccess).toBeTruthy();
    expect(newRefresh).toBeTruthy();
    expect(newRefresh).not.toEqual(first.refresh_token);

    const me = await request.get(p('auth/me'), { headers: bearer(newAccess) });
    expect(me.status()).toBe(200);
  });

  test('TC06 - Reuse detection: dùng lại refresh token cũ thu hồi toàn bộ phiên', async ({ request }) => {
    test.setTimeout(60_000);
    const first = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    const rt1 = first.refresh_token;

    const refreshed = await request.post(p('auth/refresh'), { data: { refreshToken: rt1 } });
    expect(refreshed.status()).toBeLessThan(300);
    const rt2 = findKey(await safeJson(refreshed), 'refresh_token');
    expect(rt2).toBeTruthy();

    // Chờ vượt grace period 15 giây
    await new Promise((r) => setTimeout(r, 16_000));

    const reuse = await request.post(p('auth/refresh'), { data: { refreshToken: rt1 } });
    expect(reuse.status()).toBe(401);

    // Toàn bộ phiên bị thu hồi: RT2 cũng không dùng được nữa
    const afterRevoke = await request.post(p('auth/refresh'), { data: { refreshToken: rt2 } });
    expect(afterRevoke.status()).toBe(401);
  });
});

