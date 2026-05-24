export type Brand<T, B extends string> = T & { readonly __brand: B };
export type OrgId = Brand<string, 'OrgId'>;
export type UserId = Brand<string, 'UserId'>;
export type StoreId = Brand<string, 'StoreId'>;
