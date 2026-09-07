import "./globals.css";

export const metadata = {
  title: "ezequote – AI Floor Plan Segmentation",
  description: "Enterprise CAD/BIM floor plan analysis with AI-powered room detection, wall segmentation, and door recognition.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300..800;1,300..800&family=Outfit:ital,wght@0,300..800;1,300..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
