import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import TrustIndicators from "@/components/TrustIndicators";
import HowItWorks from "@/components/HowItWorks";
import Features from "@/components/Features";
import Comparison from "@/components/Comparison";
import UserRoles from "@/components/UserRoles";
import Stats from "@/components/Stats";
import CallToAction from "@/components/CallToAction";
import Footer from "@/components/Footer";

export const metadata = {
  title: "CREDENCE | Blockchain-Powered Academic Certificate Platform",
  description:
    "Issue, manage and verify academic certificates with cryptographic blockchain trust. Built for higher education institutions.",
};

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="pt-20">
        <HeroSection />
        <TrustIndicators />
        <HowItWorks />
        <Features />
        <Comparison />
        <UserRoles />
        <Stats />
        <CallToAction />
      </main>
      <Footer />
    </>
  );
}
