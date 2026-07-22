import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "CREDENCE | Blockchain-Powered Academic Trust",
  description:
    "Secure, transparent, and instantly verifiable academic certificates powered by blockchain technology.",
  icons: {
    icon:        "/fav.png",
    shortcut:    "/fav.png",
    apple:       "/fav.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
