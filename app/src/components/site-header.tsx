"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "@/components/wallet-button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Offerings", match: (p: string) => p === "/" || (p.startsWith("/projects") && !p.endsWith("/trade")) },
  { href: "/market", label: "Market", match: (p: string) => p.startsWith("/market") || p.endsWith("/trade") },
  { href: "/portfolio", label: "Portfolio", match: (p: string) => p.startsWith("/portfolio") },
  { href: "/#verification", label: "Verification", match: () => false },
];

export function SiteHeader() {
  const path = usePathname();
  const links = NAV.map(({ href, label, match }) => (
    <Link
      key={label}
      href={href}
      aria-current={match(path) ? "page" : undefined}
      className={cn(
        "py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
        match(path) && "text-foreground",
      )}
    >
      {label}
    </Link>
  ));
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-10 px-6 lg:px-12">
        <Link href="/" className="font-serif text-[22px] tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          Solaris
        </Link>
        <nav aria-label="Main" className="hidden gap-7 sm:flex">
          {links}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden text-[13px] text-muted-foreground sm:inline" title="Solana devnet. Test assets only.">
            Devnet
          </span>
          <WalletButton />
        </div>
      </div>
      <nav aria-label="Main mobile" className="flex gap-6 overflow-x-auto px-6 pb-2 sm:hidden">
        {links}
      </nav>
    </header>
  );
}
