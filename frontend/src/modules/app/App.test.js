import { jsx as _jsx } from "react/jsx-runtime";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
describe('App', () => {
    it('renders header', () => {
        const client = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false
                }
            }
        });
        render(_jsx(QueryClientProvider, { client: client, children: _jsx(App, {}) }));
        expect(screen.getByText(/Gestionnaire VPN/)).toBeInTheDocument();
    });
});
