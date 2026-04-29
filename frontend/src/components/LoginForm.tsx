import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface LoginFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onCancel }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className="bg-gray-800 p-8 rounded-lg shadow-xl border border-gray-700 w-full max-w-md">
      <h2 className="text-2xl font-bold text-blue-400 mb-6 text-center">System Access</h2>
      {error && <div className="bg-red-900 text-red-200 p-3 rounded mb-4 text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-300 text-sm font-semibold mb-2" htmlFor="email">
            Operative ID (Email)
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-gray-900 text-white border border-gray-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-gray-300 text-sm font-semibold mb-2" htmlFor="password">
            Security Key (Password)
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-gray-900 text-white border border-gray-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
            required
          />
        </div>
        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded transition duration-200"
          >
            Abort
          </button>
          <button
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded transition duration-200 shadow-[0_0_15px_rgba(37,99,235,0.5)]"
          >
            Authenticate
          </button>
        </div>
      </form>
    </div>
  );
};
