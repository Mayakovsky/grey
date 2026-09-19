// Bankr x402 Cloud handler for the "legitimacy-scan" service (bankr.x402.json). Plain
// server-to-server fetch, no payment logic — Bankr's facilitator already settled payment before
// this code runs. Deliberately outside the pnpm workspace (integrations/ is not in
// pnpm-workspace.yaml's packages glob) and has zero dependency on @grey/* internals — deployable,
// deletable, zero blast radius to grey-core. See BANKR-BRIDGE-BUILD-KOV-directive.md.
export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }
  const body = await req.json();
  if (!body?.token_address) {
    return Response.json({ error: "token_address is required" }, { status: 400 });
  }

  const res = await fetch(
    process.env.GREY_BRIDGE_URL ?? "https://api.whitepapergrey.com/v1/bridge/bankr/legitimacy_scan",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Grey-Bridge-Secret": process.env.GREY_BANKR_BRIDGE_SECRET!,
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    return Response.json({ error: "upstream error" }, { status: 502 });
  }
  return await res.json();
}
