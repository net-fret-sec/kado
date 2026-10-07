import type { Request } from "express";

export function localAdminToolsEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.ENABLE_LOCAL_ADMIN_TOOLS === "true"
  );
}

export function isLocalAdminRequest(req: Request): boolean {
  const ip = req.socket.remoteAddress;
  if (
    !localAdminToolsEnabled() ||
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip ?? "")
  )
    return false;
  if (
    Object.keys(req.headers).some(
      (key) => key === "forwarded" || key.startsWith("x-forwarded-"),
    )
  )
    return false;
  // Reject browser requests from other origins, including DNS rebinding hosts.
  const host = req.header("host") ?? "";
  const origin = req.header("origin");
  try {
    const local = new URL(`http://${host}`);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(local.hostname))
      return false;
    if (
      origin &&
      !["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)
    )
      return false;
    return true;
  } catch {
    return false;
  }
}
