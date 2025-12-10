import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthService, { DecodedToken, SignInRequest, VerifyRequest, RoleType, AUTH_EVENTS } from '../services/AuthService';
import NotificationService from '../services/NotificationService';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: DecodedToken | null;
  signIn: (data: SignInRequest) => Promise<{ requiresVerification: boolean; message?: string }>;
  verify: (data: VerifyRequest) => Promise<void>;
  signOut: () => Promise<void>;
  loadUser: () => Promise<void>;
  isAdmin: () => boolean;
  isAssistant: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<DecodedToken | null>(null);

  const loadUser = async () => {
    try {
      const accessToken = await AsyncStorage.getItem('access_token');
      if (accessToken) {
        const decoded = AuthService.decodeToken(accessToken);
        if (decoded) {
          // Check if token is expired
          if (decoded.exp * 1000 > Date.now()) {
            setUser(decoded);
            setIsAuthenticated(true);
          } else {
            // Try to refresh token
            try {
              const refreshToken = await AsyncStorage.getItem('refresh_token');
              if (refreshToken) {
                const response = await AuthService.refreshToken(refreshToken);
                await AuthService.saveTokens(response.access_token, response.refresh_token);
                const newDecoded = AuthService.decodeToken(response.access_token);
                setUser(newDecoded);
                setIsAuthenticated(true);
              } else {
                await AuthService.clearTokens();
                setIsAuthenticated(false);
              }
            } catch (error) {
              await AuthService.clearTokens();
              setIsAuthenticated(false);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUser();

    // Subscribe to unauthorized events (when refresh token fails)
    const handleUnauthorized = () => {
      console.log('🔴 Received UNAUTHORIZED event - logging out user');
      setUser(null);
      setIsAuthenticated(false);
    };

    AuthService.on(AUTH_EVENTS.UNAUTHORIZED, handleUnauthorized);

    return () => {
      AuthService.off(AUTH_EVENTS.UNAUTHORIZED, handleUnauthorized);
    };
  }, []);

  const signIn = async (data: SignInRequest): Promise<{ requiresVerification: boolean; message?: string }> => {
    try {
      const response = await AuthService.signIn(data);
      
      if (response.access_token && response.refresh_token) {
        await AuthService.saveTokens(response.access_token, response.refresh_token);
        const decoded = AuthService.decodeToken(response.access_token);
        setUser(decoded);
        setIsAuthenticated(true);
        
        // Регистрация PUSH-токена после успешного входа
        NotificationService.registerPushToken().catch(err => {
          console.warn('Failed to register push token:', err);
        });
        
        return { requiresVerification: false };
      } else if (response.message) {
        return { requiresVerification: true, message: response.message };
      }
      
      throw new Error('Unexpected response format');
    } catch (error) {
      console.error('Sign in error:', error);
      // If backend responded 400 with a message (e.g., needs verification), surface it as verification flow
      const anyErr: any = error;
      const msg = anyErr?.response?.data?.message as string | undefined;
      const status = anyErr?.response?.status as number | undefined;
      if (status === 400 && msg) {
        return { requiresVerification: true, message: msg };
      }
      throw error;
    }
  };

  const verify = async (data: VerifyRequest): Promise<void> => {
    try {
      const response = await AuthService.verify(data);
      await AuthService.saveTokens(response.access_token, response.refresh_token);
      const decoded = AuthService.decodeToken(response.access_token);
      setUser(decoded);
      setIsAuthenticated(true);
      
      // Регистрация PUSH-токена после верификации
      NotificationService.registerPushToken().catch(err => {
        console.warn('Failed to register push token:', err);
      });
    } catch (error) {
      console.error('Verification error:', error);
      // Bubble up server message so UI can prompt re-sign-in if expired
      const anyErr: any = error;
      const msg = anyErr?.response?.data?.message as string | undefined;
      if (msg) {
        throw new Error(msg);
      }
      throw error;
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      // Деактивировать PUSH-токен перед выходом
      await NotificationService.deactivatePushToken().catch(err => {
        console.warn('Failed to deactivate push token:', err);
      });
      
      await AuthService.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const isAdmin = (): boolean => {
    return user?.role === 'ADMIN';
  };

  const isAssistant = (): boolean => {
    return user?.role === 'ASSISTANT';
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        signIn,
        verify,
        signOut,
        loadUser,
        isAdmin,
        isAssistant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

