// Base URL for API calls. Empty/unset → same-origin "/api" (the Vite dev proxy,
// or a reverse proxy in production). Set VITE_API_BASE_URL for a separate API host.
const configured = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = (configured || '/api').replace(/\/+$/, '');
