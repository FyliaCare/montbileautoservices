"use client";

import React, { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center bg-gray-50 dark:bg-gray-950">
          <span className="text-5xl">⚠️</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Something went wrong
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
            An unexpected error occurred. Please refresh the app to continue.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
            className="rounded-xl bg-gold px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-gold-dark transition-colors"
          >
            Refresh App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
