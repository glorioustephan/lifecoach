import type { ReactNode } from "react";
import { ViewHeader } from "./ViewHeader";

interface Props {
  title: string;
  subtitle?: string;
  note: ReactNode;
}

export const PlaceholderView = ({ title, subtitle, note }: Props): JSX.Element => (
  <div className="flex h-full min-h-0 flex-col">
    <ViewHeader title={title} {...(subtitle ? { subtitle } : {})} />
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-md space-y-3 text-center">
        <p className="text-sm text-fg-muted">{note}</p>
        <p className="text-xs text-fg-faint">
          Coming in the next iteration.
        </p>
      </div>
    </div>
  </div>
);
