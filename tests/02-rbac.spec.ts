import { test, expect } from '@playwright/test';
import { bearer, env, loginOk, p } from '../helpers/api';

test.describe('SC03 - Phân quyền theo vai trò (RBAC)', () => {
  test('TC11 - Gọi API khi không có token', async ({ request }) => {
    const res = await request.get(p('ncs'));
    expect(res.status()).toBe(401);
  });

  test('TC12 - Gọi API với token bị sửa đổi', async ({ request }) => {
    const { access_token } = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    const last = access_token.slice(-1);
    const tampered = access_token.slice(0, -1) + (last === 'A' ? 'B' : 'A');
    const res = await request.get(p('auth/me'), { headers: bearer(tampered) });
    expect(res.status()).toBe(401);
  });

  test('TC13 - NCS gọi API quản trị người dùng', async ({ request }) => {
    const { access_token } = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    const res = await request.get(p('auth/users'), { headers: bearer(access_token) });
    expect(res.status()).toBe(403);
  });

  test('TC16 - IDOR: NCS truy cập tài liệu của NCS khác', async ({ request }) => {
    test.skip(!process.env.DOC_ID_OF_OTHER_NCS, 'Chưa đặt DOC_ID_OF_OTHER_NCS trong .env');
    const { access_token } = await loginOk(request, 'NCS_USER', 'NCS_PASS');
    const id = process.env.DOC_ID_OF_OTHER_NCS!;
    const meta = await request.get(p(`documents/${id}`), { headers: bearer(access_token) });
    const file = await request.get(p(`documents/${id}/download`), { headers: bearer(access_token) });
    expect([403, 404]).toContain(meta.status());
    expect([403, 404]).toContain(file.status());
  });

  test('TC18 - Truy cập nhật ký kiểm toán theo vai trò', async ({ request }) => {
    const gv = await loginOk(request, 'GIAOVU_USER', 'GIAOVU_PASS');
    const gvhd = await loginOk(request, 'GVHD_USER', 'GVHD_PASS');
    const ncs = await loginOk(request, 'NCS_USER', 'NCS_PASS');

    const rGv = await request.get(p('audit-logs'), { headers: bearer(gv.access_token) });
    const rGvhd = await request.get(p('audit-logs'), { headers: bearer(gvhd.access_token) });
    const rNcs = await request.get(p('audit-logs'), { headers: bearer(ncs.access_token) });

    expect(rGv.status()).toBe(403);
    expect(rGvhd.status()).toBe(403);
    expect(rNcs.status()).toBe(403);
  });
});
