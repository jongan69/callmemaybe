import type { ReactNode } from "react";

export function PublicPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "48px 24px",
        fontFamily: "Inter, system-ui, sans-serif",
        lineHeight: 1.6,
      }}
    >
      <nav
        aria-label="Public pages"
        style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 36 }}
      >
        <a href="/">CallMeMaybe</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/dpa">DPA</a>
        <a href="/acceptable-use">Calling policy</a>
        <a href="/security">Security</a>
        <a href="/support">Support</a>
        <a href="/status">Status</a>
      </nav>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
