export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  role: 'donor' | 'hospital' | 'admin';
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
}

export interface RegisterPayload {
  location?: import("@/services/location-service").LocationSelection;
  email: string;
  password: string;
  full_name?: string;
  role?: 'donor' | 'hospital';
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
}

export interface LogoutPayload {
  refresh_token?: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
  reset_token: string | null;
}

export interface ResetPasswordPayload {
  token: string;
  new_password: string;
}
