import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'定位接力 · 自动回传',description:'公开定位测试：允许定位后，首次取得有效位置即自动回传，在地图上查看位置。',robots:{index:false,follow:false},referrer:'strict-origin-when-cross-origin'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-CN"><body>{children}</body></html>}
