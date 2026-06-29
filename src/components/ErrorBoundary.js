'use client';

import React from 'react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '20px', backgroundColor: 'red', color: 'white', minHeight: '100vh', wordBreak: 'break-word', zIndex: 9999, position: 'relative' }}>
                    <h1 style={{ fontSize: '24px' }}>Application Error</h1>
                    <p style={{ fontWeight: 'bold', marginTop: '10px' }}>{this.state.error && this.state.error.toString()}</p>
                    <details style={{ whiteSpace: 'pre-wrap', marginTop: '10px', fontSize: '12px' }}>
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                </div>
            );
        }
        return this.props.children;
    }
}
