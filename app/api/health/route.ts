import { database } from "@/lib/store";
export async function GET() {
  try {
    await database().prepare("SELECT seq FROM documents LIMIT 1").all();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
