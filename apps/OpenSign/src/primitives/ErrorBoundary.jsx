import React from "react";
import { APP_NAME } from "../constant/Utils";

/**
 * Top-level React error boundary.
 *
 * Catches any uncaught render/lifecycle error anywhere in the tree and shows
 * a recovery screen instead of a blank page. Users can reload immediately,
 * clear the session and reload if the crash is persistence-related, or see
 * the underlying error message when available.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error in React tree:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  // Some crashes (corrupted localStorage, oversized cached values) only go
  // away once the persisted session state is cleared.
  handleResetAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (err) {
      console.log("err while clearing storage", err);
    }
    window.location.reload();
  };

  toggleErrorDetails = () => {
    this.setState((state) => ({ showDetails: !state.showDetails }));
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    const message = this.state.error?.message || "Unknown error";
    return (
      <div
        className="flex justify-center items-center h-[100vh] bg-base-200 px-4"
        role="alert"
      >
        <div className="max-w-[460px] w-full bg-base-100 rounded-[10px] p-[30px] text-center shadow">
          <i className="fa-light fa-exclamation-circle text-[44px] text-[#fab005]"></i>
          <h1 className="text-[20px] font-medium mb-[8px] mt-[12px]">
            {APP_NAME} ran into an unexpected error
          </h1>
          <p className="text-[14px] text-[gray] mb-[20px]">
            Your unsaved work may be lost. Reloading usually fixes this issue.
          </p>
          <div className="flex flex-col sm:flex-row gap-[10px] justify-center">
            <button
              type="button"
              className="op-btn op-btn-primary"
              onClick={this.handleReload}
            >
              Reload page
            </button>
            <button
              type="button"
              className="op-btn op-btn-outline"
              onClick={this.handleResetAndReload}
            >
              Clear session &amp; reload
            </button>
          </div>
          <button
            type="button"
            className="text-[13px] text-[gray] underline mt-[20px] hover:text-base-content"
            onClick={this.toggleErrorDetails}
          >
            {this.state.showDetails ? "Hide details" : "Show details"}
          </button>
          {this.state.showDetails && (
            <pre className="text-left text-[12px] bg-base-200 rounded-[6px] p-[10px] mt-[10px] whitespace-pre-wrap break-words max-h-[160px] overflow-auto">
              {message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
