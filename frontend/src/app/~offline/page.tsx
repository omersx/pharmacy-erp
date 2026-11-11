"use client";

import { useEffect, useState } from "react";

export default function OfflinePage() {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const response = await fetch("/", { cache: "no-store" });
      if (response.ok) {
        window.location.href = "/";
        return;
      }
    } catch {
      // Still offline
    }
    setIsRetrying(false);
  };

  useEffect(() => {
    const onOnline = () => {
      window.location.href = "/";
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Offline — غير متصل</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                  'Helvetica Neue', Arial, 'Noto Sans Arabic', sans-serif;
                background: linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .container {
                text-align: center;
                padding: 3rem 2rem;
                max-width: 480px;
              }
              .icon {
                font-size: 4rem;
                margin-bottom: 1.5rem;
                opacity: 0.9;
              }
              .title-ar {
                font-size: 1.75rem;
                font-weight: 700;
                color: #0f766e;
                margin-bottom: 0.5rem;
                direction: rtl;
              }
              .title-en {
                font-size: 1.25rem;
                font-weight: 600;
                color: #64748b;
                margin-bottom: 1.5rem;
                direction: ltr;
              }
              .desc-ar {
                font-size: 1rem;
                color: #475569;
                margin-bottom: 0.5rem;
                direction: rtl;
                line-height: 1.7;
              }
              .desc-en {
                font-size: 0.875rem;
                color: #94a3b8;
                margin-bottom: 2rem;
                direction: ltr;
                line-height: 1.6;
              }
              .retry-btn {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.875rem 2rem;
                background: #0f766e;
                color: white;
                border: none;
                border-radius: 0.75rem;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                box-shadow: 0 2px 8px rgba(15, 118, 110, 0.3);
              }
              .retry-btn:hover {
                background: #0d6b63;
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(15, 118, 110, 0.4);
              }
              .retry-btn:active { transform: translateY(0); }
              .retry-btn:disabled {
                opacity: 0.7;
                cursor: not-allowed;
                transform: none;
              }
              .spinner {
                width: 1rem;
                height: 1rem;
                border: 2px solid rgba(255,255,255,0.3);
                border-top-color: white;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
              }
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
              .tip {
                margin-top: 2rem;
                padding: 1rem;
                background: rgba(15, 118, 110, 0.06);
                border-radius: 0.5rem;
                font-size: 0.8rem;
                color: #64748b;
                line-height: 1.5;
              }
            `,
          }}
        />
      </head>
      <body>
        <div className="container">
          <div className="icon">📡</div>
          <div className="title-ar">أنت غير متصل بالإنترنت</div>
          <div className="title-en">You are offline</div>
          <div className="desc-ar">
            لا يمكن الوصول إلى الخادم حالياً. تحقق من اتصال الإنترنت وحاول مرة
            أخرى.
          </div>
          <div className="desc-en">
            The server is not reachable right now. Check your internet connection
            and try again.
          </div>
          <button
            className="retry-btn"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <>
                <div className="spinner" />
                جاري المحاولة...
              </>
            ) : (
              "🔄 إعادة المحاولة — Retry"
            )}
          </button>
          <div className="tip">
            💡 إذا كنت تستخدم نظام نقاط البيع، تأكد من أن الخادم المحلي يعمل.
            <br />
            If using the POS, make sure the local server is running.
          </div>
        </div>
      </body>
    </html>
  );
}
