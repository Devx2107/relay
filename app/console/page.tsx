import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import CommandConsole from "../components/command-console";
import GradientWaves from "../../components/GradientWaves";

export default async function ConsolePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div style={{ width: "100%", minHeight: "100vh", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: -1 }}>
        <GradientWaves
          horizonColor="#5227FF"
          waveColor="#FF9FFC"
          crestColor="#FFFFFF"
          speed={0.4}
          amplitude={2.5}
          waveScale={0.5}
          waveRatio={0.9}
          swell={35}
          turbulence={20}
          tilt={1.11}
          zoom={1.0}
          height={5.5}
          fogDepth={15}
          detail="medium"
          brightness={1.0}
          opacity={1.0}
          mouseInteraction={true}
          parallaxStrength={0.5}
          grain={true}
          grainIntensity={0.05}
        />
      </div>
      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%" }}>
        <CommandConsole email={user.email ?? ""} />
      </div>
    </div>
  );
}
