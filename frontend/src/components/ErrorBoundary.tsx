import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary to catch and handle WebGL and rendering errors
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    
    this.setState({
      error,
      errorInfo
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.errorBox}>
            <h1 style={styles.title}>⚠️ שגיאה במערכת</h1>
            <p style={styles.message}>
              אירעה שגיאה בעת טעינת המפה. ייתכן שזה בגלל בעיה ב-WebGL או ברינדור.
            </p>
            {this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>פרטי שגיאה טכניים</summary>
                <pre style={styles.errorText}>
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            <button onClick={this.handleReload} style={styles.button}>
              🔄 טען מחדש את האפליקציה
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    width: '100vw',
    backgroundColor: '#1a1a2e',
    fontFamily: 'Arial, sans-serif'
  },
  errorBox: {
    backgroundColor: '#2d2d44',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
    maxWidth: '600px',
    textAlign: 'center' as const
  },
  title: {
    color: '#ff4444',
    fontSize: '32px',
    marginBottom: '20px'
  },
  message: {
    color: '#e0e0e0',
    fontSize: '18px',
    lineHeight: '1.6',
    marginBottom: '30px'
  },
  details: {
    textAlign: 'right' as const,
    marginBottom: '20px',
    backgroundColor: '#1a1a2e',
    padding: '15px',
    borderRadius: '8px'
  },
  summary: {
    color: '#ffaa00',
    cursor: 'pointer',
    fontSize: '14px',
    marginBottom: '10px'
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: '12px',
    overflow: 'auto',
    maxHeight: '200px',
    textAlign: 'left' as const,
    direction: 'ltr' as const
  },
  button: {
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    padding: '15px 30px',
    fontSize: '16px',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
    fontWeight: 'bold' as const
  }
};
