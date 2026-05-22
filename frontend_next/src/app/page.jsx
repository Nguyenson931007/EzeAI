"use client";

import React from "react";
import dynamic from "next/dynamic";
import { AppProvider } from "@/models/app.context";

// Dynamic import to disable SSR for the entire CAD application
const App = dynamic(() => import("@/components/App"), { ssr: false });

export default function HomePage() {
  return (
    <React.StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </React.StrictMode>
  );
}
