export interface LoginResult {
  status: number;
  body: any;
  access_token?: string;
  refresh_token?: string;
}