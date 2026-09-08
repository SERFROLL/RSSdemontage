import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata={title:"ПИД · Учёт кабеля",description:"Суточные отчёты, остатки, отправки и приёмка кабеля.",icons:{icon:"/favicon.svg"}};
export const viewport: Viewport={width:"device-width",initialScale:1,viewportFit:"cover"};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ru"><body>{children}</body></html>;}
