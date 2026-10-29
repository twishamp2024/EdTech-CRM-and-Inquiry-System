import { apiRequest } from './client.js';

export function getHealth(options) {
  return apiRequest('/health', options);
}
