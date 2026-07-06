"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, Inbox, MessageCircleQuestion, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Memory", icon: Brain },
  { href: "/dashboard/ask", label: "Ask", icon: MessageCircleQuestion },
  { href: "/dashboard/queue", label: "Queue", icon: Inbox },
  { href: "/dashboard/simulator", label: "Simulator", icon: Terminal },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
