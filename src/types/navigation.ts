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
  ClientDetails: { client: import('../../database/types').Client };
  Catalogs: undefined;
  CatalogEdit: { catalogId?: number };
  PrinterSettings: undefined;
  ScannerSettings: undefined;
  Suppliers: undefined;
  SupplierDetails: { supplierUuid: string };
  Receipt: { itemUuid?: string } | undefined;
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
