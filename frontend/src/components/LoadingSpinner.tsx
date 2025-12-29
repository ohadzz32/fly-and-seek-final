import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = 'Initializing Radar...' 
}) => {
  return (
    <div style={styles.container}>
      <h2 style={styles.message}>{message}</h2>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: 'white',
    fontFamily: 'sans-serif',
    textAlign: 'center'
  },
  message: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 300
  }
};
