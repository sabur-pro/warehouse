import AuthService from './AuthService';

export interface CreateAssistantRequest {
  login: string;
  password: string;
  phone: string;
}

export interface CreateAssistantResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface Assistant {
  id: number;
  boss_id: number;
  login: string;
  phone: string;
  created_at: string;
  updated_at: string;
}

export interface AssistantsResponse {
  data: Assistant[];
  page: number;
  limit: number;
  total: number;
}

export interface GetAssistantsParams {
  page?: number;
  limit?: number;
  login?: string;
  phone?: string;
}

class AssistantService {
  async createAssistant(data: CreateAssistantRequest): Promise<CreateAssistantResponse> {
    const api = AuthService.getApiInstance();
    const accessToken = await AuthService.getAccessToken();
    
    const response = await api.post<CreateAssistantResponse>('/assistant', data, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    return response.data;
  }

  async getAssistants(params: GetAssistantsParams = {}): Promise<AssistantsResponse> {
    const api = AuthService.getApiInstance();
    const accessToken = await AuthService.getAccessToken();
    
    const { page = 1, limit = 10, login, phone } = params;
    
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (login) queryParams.append('login', login);
    if (phone) queryParams.append('phone', phone);
    
    const response = await api.get<AssistantsResponse>(
      `/assistant?${queryParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    
    return response.data;
  }
}

export default new AssistantService();

