import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer, fetchLogs } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";
import { clampLogLineCount } from "@/lib/utils/log-safety";

export const GET = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const url = new URL(req.url);
    const lines = clampLogLineCount(
      Number(url.searchParams.get("lines")) || undefined,
    );
    const entries = await fetchLogs(params.id, lines);
    return Response.json(entries);
  } catch (error) {
    return errorResponse(error);
  }
});
