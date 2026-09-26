"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="app-shell">
      <div className="app-frame">
        <section className="card error-card">
          <div className="brand-mark">✿</div>
          <div className="card-kicker">a little pause</div>
          <h1>Something interrupted the garden.</h1>
          <p>The app hit a temporary problem. Your saved days are still kept in your account.</p>
          <button className="primary-button" type="button" onClick={() => reset()}>Try again</button>
        </section>
      </div>
    </main>
  );
}
