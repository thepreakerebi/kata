import type { ReactNode } from "react";
import Link from "next/link";
import { NavLinks } from "@/components/nav-links";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col md:flex-row">
      <aside className="border-b px-4 py-4 md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-b-0 md:px-4 md:py-6">
        <nav
          aria-label="Dashboard"
          className="flex items-center gap-4 md:flex-col md:items-stretch md:gap-6"
        >
          <Link href="/dashboard" className="px-3 text-lg font-semibold">
            Kata
          </Link>
          <NavLinks />
        </nav>
      </aside>
      <section className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        {children}
      </section>
    </main>
  );
}
