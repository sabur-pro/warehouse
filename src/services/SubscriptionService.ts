import AuthService from './AuthService';

export interface SubscriptionPlan {
  id: string;
  name: string;
  duration: string;
  price: number;
  months: number;
  popular?: boolean;
}

export interface CreateSubscriptionRequest {
  price: number;
  end_date: string;
  proof_photo: any;
}

export interface CreateSubscriptionResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface Subscription {
  id: number;
  admin_id: number;
  start_date: string;
  end_date: string;
  status: 'pending' | 'active' | 'fail';
  price: number;
  created_at: string;
  updated_at: string;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'month_1',
    name: '1 месяц',
    duration: '30 дней',
    price: 99,
    months: 1,
  },
  {
    id: 'month_3',
    name: '3 месяца',
    duration: '90 дней',
    price: 280,
    months: 3,
    popular: true,
  },
  {
    id: 'month_6',
    name: '6 месяцев',
    duration: '180 дней',
    price: 550,
    months: 6,
  },
  {
    id: 'month_12',
    name: '1 год',
    duration: '365 дней',
    price: 1069,
    months: 12,
  },
];

class SubscriptionService {
  async createSubscription(
    plan: SubscriptionPlan,
    photoUri: string
  ): Promise<CreateSubscriptionResponse> {
    const api = AuthService.getApiInstance();
    const accessToken = await AuthService.getAccessToken();

    // Calculate end_date
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + plan.months);

    // Create FormData
    const formData = new FormData();
    formData.append('price', plan.price.toString());
    formData.append('end_date', endDate.toISOString());

    // Add photo
    const filename = photoUri.split('/').pop() || 'receipt.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('proof_photo', {
      uri: photoUri,
      name: filename,
      type: type,
    } as any);

    const response = await api.post<CreateSubscriptionResponse>(
      '/subscription',
      formData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data;
  }

  async getSubscription(): Promise<Subscription> {
    const api = AuthService.getApiInstance();
    const accessToken = await AuthService.getAccessToken();

    const response = await api.get<Subscription>('/subscription', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data;
  }
}

export default new SubscriptionService();

