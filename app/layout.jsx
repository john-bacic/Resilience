import "./globals.css";

export const metadata = {
  title: "Unshaken",
  description: "30-day resilience training app"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
