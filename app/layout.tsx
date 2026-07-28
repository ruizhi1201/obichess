import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ObiChess — AI Chess Coach",
  description: "Analyze your chess games with AI-powered coaching powered by Stockfish and DeepSeek",
};

export const APP_VERSION = "0.5.5";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 min-h-screen`}>
        {children}
        <div className="fixed bottom-2 right-3 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors select-none z-50">
          v{APP_VERSION}
        </div>
      </body>
    </html>
  );
}