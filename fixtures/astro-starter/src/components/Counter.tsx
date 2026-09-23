import { useState } from 'preact/hooks';

export default function Counter({ label = 'Visitors waved' }: { label?: string }) {
  const [count, setCount] = useState(0);
  return (
    <div class="counter" data-island="counter">
      <button type="button" onClick={() => setCount(count + 1)}>Wave 👋</button>
      <span>{label}: <output>{count}</output></span>
    </div>
  );
}
