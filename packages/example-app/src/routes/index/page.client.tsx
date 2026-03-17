import { useState } from "react";

export default function PageClient() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ marginTop: "2rem" }}>
      <p>This part runs in the browser.</p>
      <button onClick={() => setCount(count + 1)}>
        Clicked {count} times (testing HMR)
      </button>
    </div>
  );
}