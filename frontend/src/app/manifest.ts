import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Pharmacy ERP & POS",
    short_name: "PharmaPOS",
    description:
      "Pharmacy point of sale and inventory management — صيدلية نقاط البيع وإدارة المخزون",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    lang: "ar",
    dir: "rtl",
    categories: ["business", "medical", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Point of Sale",
        short_name: "POS",
        url: "/pos",
        icons: [
          { src: "/icons/shortcut-pos.png", sizes: "96x96" },
        ],
      },
      {
        name: "Inventory",
        short_name: "Stock",
        url: "/inventory",
        icons: [
          { src: "/icons/shortcut-stock.png", sizes: "96x96" },
        ],
      },
    ],
  };
}
