import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../../packages/ui/src/theme/ThemeProvider';
import { Workspace } from './workspace/Workspace';
createRoot(document.getElementById('root')!).render(<ThemeProvider bridge={window.commerceCanvas}><Workspace/></ThemeProvider>);
