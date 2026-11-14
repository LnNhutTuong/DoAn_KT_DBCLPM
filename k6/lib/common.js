import http from 'k6/http';
import { check, sleep } from 'k6';

export const BASE_URL = __ENV.BASE_URL;

export function login(username, password, label) {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ username, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  const ok = check(res, { [`login ${label} returns 201`]: (r) => r.status === 201 });
  if (!ok) {
    throw new Error(`Login ${label} thất bại: ${res.status} ${res.body}`);
  }
  return res;
}

export function warmup() {
  if (!BASE_URL) {
    throw new Error('Thiếu BASE_URL (chạy với -e BASE_URL=...)');
  }
  console.log('⏳ Warmup: đánh thức server...');
  for (let i = 0; i < 5; i++) {
    const res = http.get(`${BASE_URL}/api/v1/ping`, { timeout: '60s' });
    if (res.status === 200) {
      console.log('✅ Server sẵn sàng.');
      return;
    }
    console.log(`   Server chưa sẵn sàng (status ${res.status}), chờ 10s...`);
    sleep(10);
  }
  throw new Error('Server không phản hồi sau warmup');
}

export function logFail(step, res) {
  console.log(`[VU ${__VU} | iter ${__ITER}] ${step} lỗi: ${res.status} ${res.body}`);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}