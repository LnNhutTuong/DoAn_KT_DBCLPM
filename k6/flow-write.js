import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, login, warmup, logFail, todayISO } from './lib/common.js';

// open() phải nằm ở init context (top-level)
const sampleFile = open('../sample/sample.pdf', 'b');

// RUN:
//  k6 run \
//     -e BASE_URL=https://<ten-gateway>.onrender.com \
//     -e NCS_USER=... -e NCS_PASS=... \
//     -e GV_USER=... -e GV_PASS=... \
//     scripts/flow-write.js
const THU_TU = parseInt(__ENV.THU_TU || '2', 10);
const SO_PHIEU_NHAN_XET = parseInt(__ENV.SO_PHIEU || '3', 10);
const HAN_MOI = __ENV.HAN_MOI || '2030-12-30';
const DECISION_FILE_ID = __ENV.DECISION_FILE_ID || '21b15539-abfc-4850-a4f6-eceedb56bfd2';
const TIEN_TRINH_ID_FALLBACK = __ENV.TIEN_TRINH_ID || '';

export const options = {
  scenarios: {
    flow: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: __ENV.MAX_DURATION || '10m',
      exec: 'userFlow',
    },
  },
  thresholds: {
    checks: ['rate>0.95'],
  },
};

export function setup() {
  warmup();
  const ncs = login(__ENV.NCS_USER, __ENV.NCS_PASS, 'NCS');
  const gv = login(__ENV.GV_USER, __ENV.GV_PASS, 'GV');
  console.log('✅ Login xong, bắt đầu luồng.');
  return {
    ncsToken: ncs.json('access_token'),
    gvToken: gv.json('access_token'),
  };
}

export function userFlow(data) {
  const ncsAuth = { Authorization: `Bearer ${data.ncsToken}` };
  const ncsJson = { ...ncsAuth, 'Content-Type': 'application/json' };
  const gvJson = { Authorization: `Bearer ${data.gvToken}`, 'Content-Type': 'application/json' };

  // 1. Ping
  const pingRes = http.get(`${BASE_URL}/api/v1/ping`);
  check(pingRes, {
    'ping returns 200': (r) => r.status === 200,
    'ping response time < 1s': (r) => r.timings.duration < 1000,
  });

  // 2. Progress + profile (NCS)
  const progressRes = http.get(`${BASE_URL}/api/v1/progress/me`, { headers: ncsAuth });
  if (!check(progressRes, { 'getMyProgress returns 200': (r) => r.status === 200 })) {
    logFail('Progress', progressRes);
    return;
  }

  const getMeNcsRes = http.get(`${BASE_URL}/api/v1/ncs/me`, { headers: ncsAuth });
  if (!check(getMeNcsRes, { 'getMeNcs returns 200': (r) => r.status === 200 })) {
    logFail('GetMeNcs', getMeNcsRes);
    return;
  }
  const profileNcsId = getMeNcsRes.json('id');
  if (!profileNcsId) {
    logFail('GetMeNcs (không có id)', getMeNcsRes);
    return;
  }

  // 3. Upload (NCS) - multipart, không tự set Content-Type
  const uploadRes = http.post(
    `${BASE_URL}/api/v1/documents/upload`,
    {
      file: http.file(sampleFile, 'sample.pdf', 'application/pdf'),
      documentType: 'MINH_CHUNG_MOC',
    },
    { headers: ncsAuth }
  );
  if (!check(uploadRes, { 'upload returns 200/201': (r) => r.status === 200 || r.status === 201 })) {
    logFail('Upload', uploadRes);
    return;
  }
  const fileUploadId = uploadRes.json('id');

  // 4. Submit evidence (NCS)
  const submitRes = http.post(
    `${BASE_URL}/api/v1/progress/milestones/${THU_TU}/submit`,
    JSON.stringify({ fileId: fileUploadId, ghiChu: 'Từ k6' }),
    { headers: ncsJson }
  );
  if (!check(submitRes, { 'submit evidence returns 200/201': (r) => r.status === 200 || r.status === 201 })) {
    logFail('Submit', submitRes);
    return;
  }
  const evidenceId = submitRes.json('id');
  const tienTrinhId = submitRes.json('tienTrinhId') || TIEN_TRINH_ID_FALLBACK;
  if (!tienTrinhId) {
    console.log(`Không có tienTrinhId. Phản hồi submit: ${submitRes.body}`);
    return;
  }

  // 5. Create evaluations (GV)
  let evalSuccess = 0;
  for (let i = 1; i <= SO_PHIEU_NHAN_XET; i++) {
    const evalRes = http.post(
      `${BASE_URL}/api/v1/progress/evidences/${evidenceId}/evaluations`,
      JSON.stringify({
        tenNguoiCham: `Lâm Đình Trùng ${i}`,
        donViNguoiCham: 'Đại học An Giang',
        diem: 9,
        nhanXet: 'Làm Rất Tốt',
        xacNhanTrung: true,
      }),
      { headers: gvJson }
    );
    if (check(evalRes, { 'create evaluation returns 200/201': (r) => r.status === 200 || r.status === 201 })) {
      evalSuccess++;
    } else {
      logFail(`Create evaluation #${i}`, evalRes);
      break;
    }
  }
  if (!check(null, { 'đủ số bảng chấm': () => evalSuccess === SO_PHIEU_NHAN_XET })) {
    return;
  }

  // 6. Create decision (GV)
  const createDecisionRes = http.post(
    `${BASE_URL}/api/v1/decisions`,
    JSON.stringify({
      loai: 'CAN_CU_DUYET_MOC',
      soQuyetDinh: `${__VU}-${__ITER}-${Date.now()}/QĐ-ĐHAG`,
      ngayQuyetDinh: todayISO(),
      ncsIds: [profileNcsId],
      fileId: DECISION_FILE_ID || fileUploadId,
      hanMoi: HAN_MOI,
      ghiChu: '',
    }),
    { headers: gvJson }
  );
  if (!check(createDecisionRes, { 'create decision returns 200/201': (r) => r.status === 200 || r.status === 201 })) {
    logFail('Create decision', createDecisionRes);
    return;
  }
  const qd = (createDecisionRes.json('quyetDinhs') || []).find((q) => q.ncsId === profileNcsId);
  const decisionId = qd && qd.id;
  if (!decisionId) {
    logFail('Create decision (không có id)', createDecisionRes);
    return;
  }

  // 7. Approve milestone (GV)
  const approveRes = http.post(
    `${BASE_URL}/api/v1/progress/reviews/${tienTrinhId}/approve`,
    JSON.stringify({ quyetDinhId: decisionId }),
    { headers: gvJson }
  );
  if (!check(approveRes, { 'approve milestone returns 200/201': (r) => r.status === 200 || r.status === 201 })) {
    logFail('Approve milestone', approveRes);
    return;
  }

  // 8. Get notifications (NCS)
  const notiRes = http.get(`${BASE_URL}/api/v1/notifications`, { headers: ncsAuth });
  if (!check(notiRes, { 'get notifications returns 200': (r) => r.status === 200 })) {
    logFail('Get notifications', notiRes);
    return;
  }

  // 9. Check progress again (NCS)
  const progressAgainRes = http.get(`${BASE_URL}/api/v1/progress/me`, { headers: ncsAuth });
  check(progressAgainRes, { 'getMyProgress (sau duyệt) returns 200': (r) => r.status === 200 });

  sleep(1);
}