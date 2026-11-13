import { test, expect } from '@playwright/test';
import { bearer, env, loginOk, p } from '../helpers/api';

test.describe('SC03 - Phân quyền theo vai trò (RBAC)', () => {
  test('TC11 - Gọi API khi không có token', async ({ request }) => {
    const res = await request.get(p('ncs'));
    expect(res.status()).toBe(401);
  });

  test('TC12 - Gọi API với token bị sửa đổi', async ({ request }) => {
    const { accessToken } = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    const last = accessToken.slice(-1);
    const tampered = accessToken.slice(0, -1) + (last === 'A' ? 'B' : 'A');
    const res = await request.get(p('auth/me'), { headers: bearer(tampered) });
    expect(res.status()).toBe(401);
  });

  test('TC13 - NCS gọi API quản trị người dùng', async ({ request }) => {
    const { accessToken } = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    const res = await request.get(p('auth/users'), { headers: bearer(accessToken) });
    expect(res.status()).toBe(403);
  });

  test('TC16 - IDOR: NCS truy cập tài liệu của NCS khác', async ({ request }) => {
    test.skip(!process.env.DOC_ID_OF_OTHER_NCS, 'Chưa đặt DOC_ID_OF_OTHER_NCS trong .env');
    const { accessToken } = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    const id = process.env.DOC_ID_OF_OTHER_NCS!;
    const meta = await request.get(p(`documents/${id}`), { headers: bearer(accessToken) });
    const file = await request.get(p(`documents/${id}/download`), { headers: bearer(accessToken) });
    expect([403, 404]).toContain(meta.status());
    expect([403, 404]).toContain(file.status());
  });

  test('TC18 - Truy cập nhật ký kiểm toán theo vai trò', async ({ request }) => {
    const gv = await loginOk(request, 'GIAOVU_USER', 'GIAOVU_PASS');
    const gvhd = await loginOk(request, 'GVHD_USER', 'GVHD_PASS');
    const ncs = await loginOk(request, 'NCS_USER', 'NCS_PASS');

    const rGv = await request.get(p('audit-logs'), { headers: bearer(gv.accessToken) });
    const rGvhd = await request.get(p('audit-logs'), { headers: bearer(gvhd.accessToken) });
    const rNcs = await request.get(p('audit-logs'), { headers: bearer(ncs.accessToken) });

    expect(rGv.status()).toBe(200);
    expect(rGvhd.status()).toBe(403);
    expect(rNcs.status()).toBe(403);
  });
});
