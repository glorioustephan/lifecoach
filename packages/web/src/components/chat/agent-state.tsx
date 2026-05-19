import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type AgentState = "idle" | "thinking" | "tool";

interface Ctx {
  state: AgentState;
  setState: (next: AgentState) => void;
}

const AgentStateContext = createContext<Ctx | null>(null);

export const AgentStateProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [state, setState] = useState<AgentState>("idle");
  const value = useMemo(() => ({ state, setState }), [state]);
  return (
    <AgentStateContext.Provider value={value}>{children}</AgentStateContext.Provider>
  );
};

export const useAgentState = (): AgentState => {
  const ctx = useContext(AgentStateContext);
  return ctx?.state ?? "idle";
};

export const useSetAgentState = (): ((next: AgentState) => void) => {
  const ctx = useContext(AgentStateContext);
  return ctx?.setState ?? (() => undefined);
};
