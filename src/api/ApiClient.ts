import type { APIRequestContext } from '@playwright/test';
import { endpoints, type MessageResponse, type ProductsListResponse } from './endpoints';

export interface NewAccountPayload {
  name: string;
  email: string;
  password: string;
  title: 'Mr' | 'Mrs';
  birth_date: string;
  birth_month: string;
  birth_year: string;
  firstname: string;
  lastname: string;
  company: string;
  address1: string;
  address2: string;
  country: string;
  zipcode: string;
  state: string;
  city: string;
  mobile_number: string;
}

/**
 * Thin, typed wrapper around Playwright's APIRequestContext for the parts of
 * the Automation Exercise REST API this course exercises. Kept deliberately
 * small: add a method here only when a test needs that endpoint.
 */
export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseURL: string,
  ) {}

  async getProductsList(): Promise<ProductsListResponse> {
    const response = await this.request.get(`${this.baseURL}${endpoints.productsList}`);
    return response.json();
  }

  async searchProduct(searchTerm: string): Promise<ProductsListResponse> {
    const response = await this.request.post(`${this.baseURL}${endpoints.searchProduct}`, {
      form: { search_product: searchTerm },
    });
    return response.json();
  }

  async verifyLogin(email: string, password: string): Promise<MessageResponse> {
    const response = await this.request.post(`${this.baseURL}${endpoints.verifyLogin}`, {
      form: { email, password },
    });
    return response.json();
  }

  async createAccount(payload: NewAccountPayload): Promise<MessageResponse> {
    const response = await this.request.post(`${this.baseURL}${endpoints.createAccount}`, {
      form: payload as unknown as Record<string, string>,
    });
    return response.json();
  }

  async deleteAccount(email: string, password: string): Promise<MessageResponse> {
    const response = await this.request.delete(`${this.baseURL}${endpoints.deleteAccount}`, {
      form: { email, password },
    });
    return response.json();
  }
}
