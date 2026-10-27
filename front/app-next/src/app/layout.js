import WalletCancellationToast from "@/components/WalletCancellationToast";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import NotificationProvider from "@/components/NotificationProvider";
import ExtensionErrorHandler from "@/components/ExtensionErrorHandler";
import { FeedbackToastProvider } from "@/components/FeedbackToast";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata = {
  title: "Intelligent Academic Credentialing — Academic Credential Verification",
  description:
    "Verify academic certificates independently — blockchain-anchored credentials from Central University Sierra Leone.",
  icons: {
    icon:     "/fav.png",
    shortcut: "/fav.png",
    apple:    "/fav.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ExtensionErrorHandler />
        <WalletCancellationToast />
        <NotificationProvider>
          <FeedbackToastProvider>{children}</FeedbackToastProvider>
        </NotificationProvider>
      </body>
    </html>
  );
}
