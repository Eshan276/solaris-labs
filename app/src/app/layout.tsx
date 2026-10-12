import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Solaris · Own the sun. Get paid.",
  description:
    "Shares in real solar arrays. Revenue from every kilowatt-hour is distributed on Solana, backed by readings signed at the meter.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${serif.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <footer className="border-t">
            <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 text-xs leading-relaxed text-muted-foreground sm:grid-cols-[1fr_2fr] lg:px-12">
              <div>
                <p className="font-serif text-lg text-foreground">Solaris</p>
                <p className="mt-1">Solar infrastructure, on-chain.</p>
              </div>
              <div className="space-y-2">
                <p>
                  Pilot on Solana devnet. All assets are test tokens with no value. Yields are estimates based on recent
                  distributions and are not guaranteed.
                </p>
                <p className="flex flex-wrap gap-x-5">
                  <Link href="/#verification" className="hover:text-foreground">How verification works</Link>
                  <Link href="/portfolio" className="hover:text-foreground">Portfolio</Link>
                </p>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
