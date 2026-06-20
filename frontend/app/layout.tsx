import type { Metadata } from "next";
import "./globals.css";
import { ToastViewport } from "@/components/ui/Toast";
import { RoleProvider } from "@/context/RoleContext";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "ZhiPath - 408 个性化学习助手",
  description: "诊断薄弱点、安排今日任务、互动学习并动态调整路径。",
  other: {
    google: "notranslate",
  },
};

// 反闪烁脚本：服务端渲染时就把 dark class 写到 html 标签上
const themeInitScript = `
(function(){
  try {
    var t = localStorage.getItem('zhipath-theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch(e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" translate="no" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="notranslate" translate="no">
        <AuthProvider>
          <RoleProvider>
            {children}
            <ToastViewport />
          </RoleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
