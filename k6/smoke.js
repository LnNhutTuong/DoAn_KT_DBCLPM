// check api

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  iterations: 5,

  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const BASE_URL = process.env.BASE_URL;

  const response = http.get(`${BASE_URL}/api/v1/health`);

  check(response, {
    'Status is 200': (r) => r.status === 200,
    'Response time below 1s': (r) => r.timings.duration < 1000,
  });

  sleep(1);
}
