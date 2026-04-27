import type { ReactNode } from "react";

interface Props {
  title: string;
  onClose?: () => void;
  className?: string;
  children: ReactNode;
}

export function Window({ title, onClose, className = "", children }: Props) {
  return (
    <div className={`panel ${className}`}>
      <div className="panel-header">
        <div className="panel-title">{title}</div>
        {onClose && (
          <button className="panel-close" onClick={onClose} aria-label="Close">
            Back
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
