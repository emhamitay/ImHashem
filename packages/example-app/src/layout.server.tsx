export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header style={{ padding: "1rem", borderBottom: "1px solid #eee" }}>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <a href="/">Home</a>
          <a href="/about">About</a>
        </nav>
      </header>
      <main style={{ padding: "2rem" }}>
        {children}
      </main>
    </div>
  );
}