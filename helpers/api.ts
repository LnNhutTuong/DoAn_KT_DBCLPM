import { APIRequestContext, APIResponse } from '@playwright/test';
import { createHash } from 'crypto';
import fs from 'fs';
import { LoginResult } from '../type/auth';

/**
 * LƯU Ý QUAN TRỌNG
 * - BASE_URL có dấu / ở cuối (vd .../api/v1/), nên đường dẫn KHÔNG bắt đầu bằng /.
 *   Dùng hàm p('auth/login') để chuẩn hóa.
 * - Tên trường body/response bên dưới (username, password, accessToken, refreshToken,
 *   file, documentType) là theo mô tả hệ thống. Nếu DTO thật khác thì chỉnh ở file này.
 */

export const p = (path: string) => path.replace(/^\/+/, '');

export const UPLOAD_FILE_FIELD = 'file';
export const UPLOAD_TYPE_FIELD = 'documentType';

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name} (xem .env.example)`);
  return v;
}

/** Tìm giá trị của một key ở bất kỳ độ sâu nào (phòng khi response bọc trong data/result). */
export function findKey(obj: unknown, key: string): any {
  if (obj === null || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  if (key in o) return o[key];
  for (const v of Object.values(o)) {
    const r = findKey(v, key);
    if (r !== undefined) return r;
  }
  return undefined;
}

export async function safeJson(res: APIResponse): Promise<any> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

export async function login(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<LoginResult> {
  const res = await request.post(p('auth/login'), { data: { username, password } });
  const body = await safeJson(res);
  return {
    status: res.status(),
    body,
    access_token: findKey(body, 'access_token'),
    refresh_token: findKey(body, 'refresh_token'),
  };
}

export async function loginOk(request: APIRequestContext, userEnv: string, passEnv: string) {
  const r = await login(request, env(userEnv), env(passEnv));
  if (r.status >= 300 || !r.access_token) {
    throw new Error(`Đăng nhập ${env(userEnv)} thất bại (HTTP ${r.status}). Kiểm tra .env`);
  }
  return r as Required<LoginResult>;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Tạo buffer giả lập file PDF có đúng kích thước (byte), bắt đầu bằng chữ ký %PDF- */
export function makePdf(sizeBytes: number): Buffer {
  const head = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
  const tail = Buffer.from('\n%%EOF');
  if (sizeBytes < head.length + tail.length) throw new Error('size quá nhỏ');
  const buf = Buffer.alloc(sizeBytes, 0x20);
  head.copy(buf, 0);
  tail.copy(buf, sizeBytes - tail.length);
  return buf;
}

export const sha256 = (b: Buffer | string) => {
  if (typeof b === 'string') {
    return createHash('sha256').update(fs.readFileSync(b)).digest('hex');
  }
  return createHash('sha256').update(b).digest('hex');
};

export async function upload(
  request: APIRequestContext,
  token: string,
  opts: {
    buffer?: Buffer;
    filePath?: string;
    filename?: string;
    mimeType?: string;
    documentType?: string;
  },
) {
  let filePayload: any;
  if (opts.filePath) {
    filePayload = fs.createReadStream(opts.filePath);
  } else if (opts.buffer) {
    filePayload = {
      name: opts.filename ?? 'test.pdf',
      mimeType: opts.mimeType ?? 'application/pdf',
      buffer: opts.buffer,
    };
  } else {
    throw new Error('Cần cung cấp filePath hoặc buffer để upload');
  }

  return request.post(p('documents/upload'), {
    headers: bearer(token),
    multipart: {
      [UPLOAD_FILE_FIELD]: filePayload,
      [UPLOAD_TYPE_FIELD]: opts.documentType ?? 'MINH_CHUNG_MOC',
    },
  });
}
