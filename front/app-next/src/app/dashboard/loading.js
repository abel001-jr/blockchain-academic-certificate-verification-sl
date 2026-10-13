import { Loader2 } from "lucide-react";

export default function DashboardPageLoading() {
  return <div role="status" aria-live="polite" className="flex items-center gap-3 py-8 text-sm text-[#4A5A68]">
    <Loader2 size={20} className="animate-spin text-[#08283F]" /> Loading page…
  </div>;
}
