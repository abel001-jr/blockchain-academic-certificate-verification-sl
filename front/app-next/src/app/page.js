import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import FeatureStrip from "@/components/FeatureStrip";
import WhyCredence from "@/components/WhyCredence";
import LifecycleTrack from "@/components/LifecycleTrack";
import FeaturedInstitutions from "@/components/FeaturedInstitutions";
import UserRoles from "@/components/UserRoles";
import VerifySection from "@/components/VerifySection";
import CallToAction from "@/components/CallToAction";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Intelligent Academic Credentialing — Issue and verify academic credentials",
  description:
    "Intelligent Academic Credentialing lets universities issue blockchain-anchored academic credentials that employers and institutions can verify independently — no records office, no waiting.",
};

export default function Home() {
  return (
    <div className="lp-page">
      <Navbar />
      <main>
        <HeroSection />
        <FeatureStrip />
        <WhyCredence />
        <LifecycleTrack />
        <FeaturedInstitutions />
        <CallToAction />
        <UserRoles />
        <VerifySection />
      </main>
      <Footer />
    </div>
  );
}
