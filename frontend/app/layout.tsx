import type { Metadata } from "next";
import "./globals.css";
import { ToastViewport } from "@/components/ui/Toast";
import { RoleProvider } from "@/context/RoleContext";

export const metadata: Metadata = {
  title: "ZhiPath - 个性化资源生成与学习多智能体系统",
  description: "基于大模型的个性化资源生成与学习多智能体系统",
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
        <RoleProvider>
          {children}
          <ToastViewport />
        </RoleProvider>
      </body>
    </html>
  );
}
