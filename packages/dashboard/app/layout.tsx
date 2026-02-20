import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-sans-serif, system-ui", margin: 24, background: "#f7f7f2" }}>{children}</body>
    </html>
  );
}
