import { cn } from "cn"
import { LogoLoader } from "@/components/Logo"

/** The brand loader at icon size (buttons, inline states). */
function Spinner({ className }: { className?: string }) {
  return <LogoLoader label="Загрузка" className={cn("size-4", className)} />
}

export { Spinner }
