import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {applyAppearanceToDocument, loadInitialAppearance} from './services/appearance';
import {initServiceWorkerController} from './services/swController';

applyAppearanceToDocument(loadInitialAppearance());
initServiceWorkerController();

createRoot(document.getElementById('root')!).render(<App />);
