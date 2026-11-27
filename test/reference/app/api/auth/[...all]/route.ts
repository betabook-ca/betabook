import { initAuth } from "@/lib/auth";

async function handle(request: Request) {
  const auth = await initAuth();
  return auth.handler(request);
}

export const GET = handle;
export const POST = handle;
