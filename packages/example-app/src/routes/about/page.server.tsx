export default async function Page() {
  const builtAt = new Date().toISOString();
  return (
    <div>
      <h1>About</h1>
      <p>This page has no client-side JavaScript at all.</p>
      <p style={{ color: "#888", fontSize: "0.85rem" }}>Rendered at: {builtAt}</p>
    </div>
  );
}