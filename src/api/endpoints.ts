/**
 * Endpoint paths and response shapes for the public Automation Exercise API.
 * Reference: https://automationexercise.com/api_list
 */

export const endpoints = {
  productsList: '/productsList',
  brandsList: '/brandsList',
  searchProduct: '/searchProduct',
  verifyLogin: '/verifyLogin',
  createAccount: '/createAccount',
  deleteAccount: '/deleteAccount',
} as const;

export interface Product {
  id: number;
  name: string;
  price: string;
  brand: string;
  category: {
    usertype: { usertype: string };
    category: string;
  };
}

export interface ProductsListResponse {
  responseCode: number;
  products: Product[];
}

export interface MessageResponse {
  responseCode: number;
  message: string;
}
