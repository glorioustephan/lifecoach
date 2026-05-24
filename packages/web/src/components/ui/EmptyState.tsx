import { Button } from "./Button";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
}

export const EmptyState = ({
  icon,
  title,
  body,
  action,
}: EmptyStateProps): JSX.Element => (
  <div className="mt-12 flex flex-col items-center gap-3 text-center">
    <div className="text-fg-faint">{icon}</div>
    <p className="text-sm text-fg-muted">{title}</p>
    <p className="max-w-sm text-xs text-fg-faint">{body}</p>
    {action && (
      <Button
        variant="primary"
        size="sm"
        onClick={action.onClick}
        disabled={action.disabled}
        className="mt-2"
      >
        {action.label}
      </Button>
    )}
  </div>
);
