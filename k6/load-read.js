
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, login, warmup } from './lib/common.js';

const VUS = parseInt(__ENV.VUS || '30', 10);
const HOLD = __ENV.HOLD || '2m';

export const options = {
  stages: [
    { duration: '30s', target: VUS }, // tăng tải ramp-up 0 -> VUS
    { duration: HOLD, target: VUS }, // hold tại VUS
    { duration: '30s', target: 0 }, // giảm tải ramp-down VUS -> 0
  ],

  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    'http_req_duration{expected_response:true}': [
      'p(95)<1000',
    ],
  },
};

export function setup() {
  warmup();

  const ncs = login(
    __ENV.NCS_USER,
    __ENV.NCS_PASS,
    'NCS'
  );

  const token = ncs.json('access_token');

  if (!token) {
    throw new Error('Không lấy được access token');
  }

  return { token };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
  };

  const progress = http.get(
    `${BASE_URL}/api/v1/progress/me`,
    {
      headers,
      tags: { endpoint: 'progress' },
    }
  );

  check(progress, {
    'progress 200': (r) => r.status === 200,
  });

  const me = http.get(
    `${BASE_URL}/api/v1/ncs/me`,
    {
      headers,
      tags: { endpoint: 'ncs_me' },
    }
  );

  check(me, {
    'ncs/me 200': (r) => r.status === 200,
  });

  const notifications = http.get(
    `${BASE_URL}/api/v1/notifications`,
    {
      headers,
      tags: { endpoint: 'notifications' },
    }
  );

  check(notifications, {
    'notifications 200': (r) => r.status === 200,
  });

  sleep(20);
}
