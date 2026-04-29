import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const styles: Record<string, React.CSSProperties> = {
  backgroundContainer: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundImage: 'url("https://images.axios.com/no32ngbKM0wCZqDwrbXut5PVPUY=/0x395:6898x4275/1920x1080/2025/11/18/1763495676446.jpeg?w=1920")',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundColor: '#000',
    fontFamily: 'Inter, Arial, sans-serif',
    zIndex: 0,
    pointerEvents: 'auto',
    overflow: 'hidden'
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    pointerEvents: 'auto'
  },
  loginBox: {
    width: '100%',
    maxWidth: '400px',
    padding: '40px',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: '4px',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
    textAlign: 'center',
    position: 'relative',
    zIndex: 10,
    pointerEvents: 'auto'
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    fontFamily: "'Cinzel', 'Playfair Display', 'Georgia', serif",
    color: '#111',
    textTransform: 'uppercase',
    letterSpacing: '0.3em',
    marginBottom: '35px',
    marginTop: 0
  },
  errorMessage: {
    color: '#d32f2f',
    fontSize: '14px',
    marginBottom: '20px',
    backgroundColor: '#ffebee',
    padding: '10px',
    borderRadius: '4px'
  },
  inputGroup: {
    marginBottom: '20px',
    textAlign: 'left'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    color: '#333',
    marginBottom: '8px',
    fontWeight: '500'
  },
  input: {
    width: '100%',
    padding: '12px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '16px',
    backgroundColor: '#fff',
    boxSizing: 'border-box',
    outline: 'none'
  },
  submitButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#000',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    transition: 'background-color 0.2s'
  },
  toggleText: {
    marginTop: '20px',
    fontSize: '14px',
    color: '#555',
    cursor: 'pointer',
    textDecoration: 'underline'
  }
};

export const EntranceScreen: React.FC = () => {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, email, password);
      }
    } catch (err: any) {
      const backendError = err?.response?.data?.message || err?.response?.data;

      if (isLogin) {
        setError(backendError || 'Authentication failed. Please check your credentials.');
      } else {
        setError(backendError ? `Registration failed: ${backendError}` : 'Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.backgroundContainer}>
      <div style={styles.overlay}>
        <div style={styles.loginBox}>
          <h1 style={styles.title}>Fly and Seek</h1>
          
          <form onSubmit={handleSubmit}>
            {error && <div style={styles.errorMessage}>{error}</div>}

            <div style={styles.inputGroup}>
              <label style={styles.label}>User name</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.input}
                required
              />
            </div>

            {!isLogin && (
              <div style={styles.inputGroup}>
                <label style={styles.label}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                  required
                />
              </div>
            )}

            <div style={styles.inputGroup}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                required
              />
            </div>

            <button type="submit" style={styles.submitButton} disabled={isLoading}>
              {isLoading ? 'PROCESSING...' : 'ENTER'}
            </button>

            <div style={styles.toggleText} onClick={() => setIsLogin(!isLogin)}>
              {isLogin 
                ? "Don't have an account? Register" 
                : "Already have an account? Login"}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
