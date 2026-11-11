"use client";

import { usePwaRegistration } from "@/hooks/use-pwa-registration";
import { InstallButton } from "./InstallButton";
import { IosInstallHint } from "./IosInstallHint";
import { UpdateBanner } from "./UpdateBanner";

/**
 * PWA Provider — renders all PWA-related UI components.
 * Include once in the root locale layout.
 */
export function PwaProvider() {
  usePwaRegistration();

  return (
    <>
      <IosInstallHint />
      <UpdateBanner />
    </>
  );
}

export { InstallButton };
