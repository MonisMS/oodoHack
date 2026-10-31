import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './routes';
import { SessionProvider } from './lib/session';
import './styles.css';
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 1 } } });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><SessionProvider><RouterProvider router={router} /></SessionProvider></QueryClientProvider></React.StrictMode>);
