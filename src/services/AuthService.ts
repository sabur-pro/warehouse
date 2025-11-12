import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../config/api';

export interface SignInRequest {
  gmail?: string;
  login?: string;
  password: string;
}

export interface SignInResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  message?: string;
}

export interface VerifyRequest {
  code: string;
  gmail: string;
}

export interface VerifyResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export type RoleType = 'ADMIN' | 'ASSISTANT' | 'SUPER_ADMIN';

export interface DecodedToken {
  session_id: string;
  admin_id?: number;
  user_id?: number;
  bossId?: number;
  gmail?: string;
  login?: string;
  phone?: string;
  role: RoleType;
  iss: string;
  sub: string;
  exp: number;
  nbf: number;
  iat: number;
}

class AuthService {
  private api: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: {
    resolve: (value?: unknown) => void;
    reject: (reason?: unknown) => void;
  }[] = [];

  constructor() {
    this.api = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds timeout
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Response interceptor for handling 401 errors
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          console.log('🔴 401 Error detected, attempting token refresh...');
          
          if (this.isRefreshing) {
            console.log('🔄 Already refreshing token, queuing request...');
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            })
              .then(() => {
                console.log('✅ Token refreshed, retrying queued request...');
                return this.api(originalRequest);
              })
              .catch((err) => {
                console.log('❌ Token refresh failed for queued request');
                return Promise.reject(err);
              });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const refreshToken = await AsyncStorage.getItem('refresh_token');
            if (!refreshToken) {
              console.log('❌ No refresh token available in storage');
              throw new Error('No refresh token available');
            }

            console.log('🔄 Attempting to refresh token...');
            const response = await this.refreshToken(refreshToken);
            console.log('✅ Token refreshed successfully');
            
            await this.saveTokens(response.access_token, response.refresh_token);
            console.log('✅ New tokens saved to storage');

            this.failedQueue.forEach((promise) => promise.resolve());
            this.failedQueue = [];

            originalRequest.headers['Authorization'] = `Bearer ${response.access_token}`;
            console.log('🔄 Retrying original request with new token...');
            return this.api(originalRequest);
          } catch (err: any) {
            console.log('❌ Token refresh failed:', err.message || err);
            console.log('Error details:', err.response?.data || err);
            this.failedQueue.forEach((promise) => promise.reject(err));
            this.failedQueue = [];
            await this.clearTokens();
            return Promise.reject(err);
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  async signIn(data: SignInRequest): Promise<SignInResponse> {
    const response = await this.api.post<SignInResponse>('/auth/sign-in', data);
    return response.data;
  }

  async verify(data: VerifyRequest): Promise<VerifyResponse> {
    const response = await this.api.post<VerifyResponse>('/auth/verify', data);
    return response.data;
  }

  async signOut(): Promise<void> {
    const accessToken = await AsyncStorage.getItem('access_token');
    if (accessToken) {
      try {
        await this.api.post(
          '/auth/sign-out',
          {},
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
      } catch (error) {
        console.error('Sign out error:', error);
      }
    }
    await this.clearTokens();
  }

  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    const response = await axios.post<RefreshTokenResponse>(
      `${BASE_URL}/auth/refresh-token`,
      { refresh_token: refreshToken },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  }

  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await AsyncStorage.setItem('access_token', accessToken);
    await AsyncStorage.setItem('refresh_token', refreshToken);
  }

  async clearTokens(): Promise<void> {
    await AsyncStorage.removeItem('access_token');
    await AsyncStorage.removeItem('refresh_token');
  }

  async getAccessToken(): Promise<string | null> {
    return await AsyncStorage.getItem('access_token');
  }

  decodeToken(token: string): DecodedToken | null {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }

  getApiInstance(): AxiosInstance {
    return this.api;
  }
}

export default new AuthService();

