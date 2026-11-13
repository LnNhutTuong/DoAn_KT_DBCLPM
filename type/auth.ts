export interface LoginResult {
  status: number;
  body: any;
  accessToken?: string;
  refreshToken?: string;
}