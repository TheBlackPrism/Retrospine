import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Retrospine",
    short_name: "Retrospine",
    description: "A personal shelf for the books you read and the ones you will.",
    start_url: "/library",
    display: "standalone",
    background_color: "#f8f3e9",
    theme_color: "#f8f3e9",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
