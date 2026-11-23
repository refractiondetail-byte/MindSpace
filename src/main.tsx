import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initDatabase } from './core/db';
import App from './ui/App';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Missing #root element in index.html');
}

const root = createRoot(container);

async function bootstrap(): Promise<void> {
  try {
    // One-time seeding runs here, on open/startup — never inside useLiveQuery,
    // whose read-only transaction would fail with ReadOnlyError.
    await initDatabase();
  } catch (error) {
    console.error('MindSpace: failed to open/seed the local database', error);
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
