// Aviso para acciones que solo puede hacer el administrador de la simulación.
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "../store";
import { Button, Notice } from "./ui";

export function AdminRequired({ children }: { children?: ReactNode }) {
  const { openDialog } = useStore();
  return (
    <Notice title="Requiere administrador"
      actions={<Button size="sm" icon={<Lock size={12} />} onClick={() => openDialog("admin")}>Ingresar</Button>}>
      {children ?? "Esta acción cambia la red compartida. Solo la puede hacer quien administra la simulación."}
    </Notice>
  );
}
