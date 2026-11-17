import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'An unexpected rendering error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F9F8] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-neutral-200 rounded-xl p-8">
            <div className="flex items-center gap-3 text-amber-700 mb-4">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-xl font-semibold text-[#0B3B2E]">Application Recovery</h2>
            </div>
            <p className="text-sm text-neutral-600 mb-4 leading-relaxed">
              CivicSense AI encountered a runtime error while rendering this view.
            </p>
            <pre className="text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-neutral-700 overflow-x-auto mb-6">
              {this.state.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Platform
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
