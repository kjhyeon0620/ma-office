import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>ma-office dashboard</h1>
      <p>Run observability from JSONL event logs.</p>
      <Link href="/runs">Open runs</Link>
    </main>
  );
}
