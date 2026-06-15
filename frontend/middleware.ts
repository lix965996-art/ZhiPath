import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js middleware — 当前仅做 pass-through。
 * 认证由客户端 AuthContext 处理（支持"先不登录直接使用"）。
 * 预留此文件以便后续添加服务端路由保护。
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    // 仅匹配页面路径，排除静态资源和 API 代理
    "/((?!_next/static|_next/image|api|favicon.ico).*)",
  ],
};
