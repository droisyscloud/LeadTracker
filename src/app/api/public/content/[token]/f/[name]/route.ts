// The same file at an address that ends in its name (Microsoft's Office viewer needs the extension).
import { GET as file } from "../../route";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ token: string; name: string }> }) { const { token } = await params; return file(req, { params: Promise.resolve({ token }) }); }
