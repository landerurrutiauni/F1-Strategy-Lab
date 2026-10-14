import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/saira/wdth.css';
import '@fontsource-variable/saira/wdth-italic.css';
import '@fontsource-variable/archivo/wdth.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/menu.css';
import './styles/briefing.css';
import './styles/race.css';
import './styles/results.css';
import './styles/pages.css';
import App from './App';
import { SettingsProvider } from './hooks/settings';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
);
