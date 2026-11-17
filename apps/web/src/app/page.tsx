import { Hero } from "@/features/home/Hero";
import { Numbers } from "@/features/home/Numbers";
import { ProductCards } from "@/features/home/ProductCards";
import { RegistryFeed } from "@/features/home/RegistryFeed";
import { Narrative } from "@/features/home/narrative/Narrative";
import { SectionHud } from "@/features/home/SectionHud";
import { Telemetry } from "@/features/home/Telemetry";

export default function HomePage() {
  return (
    <>
      <SectionHud />
      <Hero />
      <Narrative />
      <ProductCards />
      <Numbers />
      <RegistryFeed />
      <Telemetry />
    </>
  );
}
