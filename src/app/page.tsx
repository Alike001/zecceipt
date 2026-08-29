import { LandingPage } from "@/components/marketing/landing-page";
import { getLiveNetworkView } from "@/lib/zcash/network";

export const dynamic = "force-dynamic";

export default async function Home() {
  const network = await getLiveNetworkView();
  return <LandingPage network={network} />;
}
