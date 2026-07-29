import Link from "next/link";

const HOME_TILES = [
  {
    href: "/calendar",
    title: "Finances",
    description: "Payslips, salary stats, installments & house payments",
    className:
      "border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100 dark:hover:bg-indigo-900/60",
  },
  {
    href: "/blood-pressure",
    title: "Health",
    description: "Blood-pressure readings & charts",
    className:
      "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-100 dark:hover:bg-rose-900/60",
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center gap-6 px-4 py-10 sm:px-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {HOME_TILES.map(({ href, title, description, className }) => (
          <Link
            key={href}
            href={href}
            className={`flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-xl border p-8 text-center shadow-sm transition ${className}`}
          >
            <span className="text-2xl font-semibold">{title}</span>
            <span className="text-sm opacity-80">{description}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
