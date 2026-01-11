// src/types/navigation.ts

export type RootTabParamList = {
  Warehouse: undefined;
  History: undefined;
  Statistics: undefined;
  Cart: undefined;
  Profile: undefined;
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  Subscription: undefined;
  PendingActions: undefined;
  Settings: undefined;
  Clients: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
  Verification: { gmail: string };
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
