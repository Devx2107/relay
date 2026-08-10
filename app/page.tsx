import Link from "next/link";
import GradientBlinds from "@/components/GradientBlinds";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-black">
      {/* Background layer */}
      <div className="fixed inset-0 z-0 pointer-events-auto">
        <GradientBlinds
          gradientColors={["#FF9FFC", "#5227FF"]}
          angle={20}
          noise={0.2}
          blindCount={16}
          blindMinWidth={50}
          spotlightRadius={0.5}
          spotlightSoftness={1}
          spotlightOpacity={1}
          mouseDampening={0.15}
          distortAmount={1}
          shineDirection="left"
          mixBlendMode="normal"
        />
      </div>

      {/* Foreground content layer */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 relative z-10 pointer-events-none">
        <h1 className="text-6xl font-extrabold text-white mb-6 drop-shadow-md">Welcome to Relay</h1>
        <p className="text-xl text-zinc-200 mb-10 max-w-2xl text-center drop-shadow-sm font-medium">
          The intelligent command console for your workflows.
        </p>
        <div className="pointer-events-auto mt-4">
          <Link
            href="/console"
            className="inline-block px-10 py-4 rounded-full font-medium text-white shadow-lg backdrop-blur-md bg-black/10 border border-white/20 hover:bg-black/20 transition-all duration-300 hover:shadow-xl hover:scale-105"
          >
            Access Console
          </Link>
        </div>
      </main>
    </div>
  );
}
