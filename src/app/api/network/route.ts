import { getLiveNetworkView } from "@/lib/zcash/network";

export const dynamic = "force-dynamic";

export async function GET() {
  const view = await getLiveNetworkView();

  return Response.json(view, {
    status: view.status === "unavailable" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
