import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, warmup } from './lib/common.js';

// 401 (sai mật khẩu) và 429 đều là kết quả mong đợi, không tính là request lỗi
http.setResponseCallback(http.expectedStatuses(200, 201, 401, 429));

const LIMIT = parseInt(__ENV.LIMIT || '5', 10);              // @LimitStrict: 5 lần/phút
const WINDOW_SEC = parseInt(__ENV.WINDOW_SEC || '60', 10);   // ttl 60_000
const RUN_ID = Date.now();                                    // username mới mỗi lần chạy, tránh dính bộ đếm cũ

export const options = {
  vus: 1,
  iterations: 1,
  maxDuration: `${WINDOW_SEC + 120}s`,
  thresholds: { checks: ['rate==1'] },
};

export function setup() {
  warmup();
}

// Đăng nhập sai mật khẩu cố ý, không tạo token, không đụng tài khoản thật
function attempt(username) {
  return http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ username, password: 'sai-mat-khau-k6' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export default function () {
  const userA = `k6_rl_${RUN_ID}`;
  const userB = `k6_rl_other_${RUN_ID}`;

  // 1. LIMIT lần đầu phải qua được (401 sai mật khẩu, chưa bị 429)
  for (let i = 1; i <= LIMIT; i++) {
    const res = attempt(userA);
    check(res, { [`lần ${i}/${LIMIT} chưa bị chặn (401)`]: (r) => r.status === 401 });
  }

  // 2. Lần LIMIT+1 phải bị 429
  const blocked = attempt(userA);
  check(blocked, { [`lần ${LIMIT + 1} bị 429`]: (r) => r.status === 429 });
  console.log(`Header của 429: ${JSON.stringify(blocked.headers)}`);   // đối chiếu tên header thật (mục 10)

  // 3. Đếm không phân biệt hoa/thường (tracker dùng toLowerCase)
  const upper = attempt(userA.toUpperCase());
  check(upper, { 'username viết HOA vẫn dùng chung bộ đếm (429)': (r) => r.status === 429 });

  // 4. Username khác có bộ đếm riêng, không bị ảnh hưởng
  const other = attempt(userB);
  check(other, { 'username khác không bị chặn (401)': (r) => r.status === 401 });

  // 5. Chờ hết cửa sổ, userA phải đăng nhập thử lại được
  console.log(`Chờ ${WINDOW_SEC + 5}s cho hết cửa sổ rate limit...`);
  sleep(WINDOW_SEC + 5);
  const after = attempt(userA);
  check(after, { 'hết cửa sổ thì hết chặn (401)': (r) => r.status === 401 });
}