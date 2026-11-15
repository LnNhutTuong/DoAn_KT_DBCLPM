
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, login, warmup } from './lib/common.js';

// HTTP 200 và 429 là các response được mong đợi
http.setResponseCallback(http.expectedStatuses(200, 429));

// Đếm riêng các loại response
const limited = new Counter('rate_limited_429');
const successful = new Counter('successful_200');

const NCS_PASS = __ENV.NCS_PASS || '123456';

const ACCOUNTS = [
  {
    name: 'NCS014',
    user: __ENV.USER_014 || 'ncs014',
    pass: NCS_PASS,
  },
  {
    name: 'NCS016',
    user: __ENV.USER_015 || 'ncs016',
    pass:   NCS_PASS,
  },
  {
    name: 'NCS017',
    user: __ENV.USER_017 || 'ncs017',
    pass:   NCS_PASS,
  },
];

export const options = {
  stages: [
    { duration: '1m', target: 100 },    
    { duration: '1m', target: 200 },
    { duration: '2m', target: 300 },
    { duration: '30s', target: 0 },
  ],

  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

export function setup() {
  warmup();

  // Đăng nhập 3 tài khoản đúng 1 lần
  const tokens = ACCOUNTS.map((account) => {
    const res = login(account.user, account.pass, 'NCS');
    const token = res.json('access_token');

    if (!token) {
      throw new Error(`Login failed: ${account.name}`);
    }

    console.log(`Login successful: ${account.name}`);

    return token;
  });

  return {
    tokens,
    accounts: ACCOUNTS.map((a) => a.name),
  };
}

export default function (data) {
  // Chia VU luân phiên cho 3 tài khoản
  const accountIndex = (__VU - 1) % 3;

  const token = data.tokens[accountIndex];
  const account = data.accounts[accountIndex];

  const headers = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  const urls = [
    '/api/v1/progress/me',
    '/api/v1/ncs/me',
    '/api/v1/notifications',
  ];

  for (const url of urls) {
    const res = http.get(`${BASE_URL}${url}`, {
      ...headers,
      tags: {
        endpoint: url,
        account: account,
      },
    });

    if (res.status === 429) {
      limited.add(1, {
        account: account,
        endpoint: url,
      });
    } else if (res.status === 200) {
      successful.add(1, {
        account: account,
        endpoint: url,
      });

      check(res, {
        'status 200': (r) => r.status === 200,
      });
    } else {
      check(res, {
        'status 200': (r) => r.status === 200,
      });
    }
  }

  sleep(1);
}
