import axios from 'axios';

// When using Vite proxy, we use a relative URL
const API_URL = ''; 

// Configure Axios to always send cookies
const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Crucial for session cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

export const authService = {
  login: async (username: string, password: string) => {
    const response = await axiosInstance.post('/api/auth/login', { username, password });
    return response.data;
  },

  register: async (username: string, email: string, password: string) => {
    const response = await axiosInstance.post('/api/auth/register', { username, email, password });
    return response.data;
  },

  logout: async () => {
    const response = await axiosInstance.post('/api/auth/logout');
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await axiosInstance.get('/api/auth/me');
    return response.data;
  },
};
