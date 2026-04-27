import type { ReactNode } from "react";

interface Props {
  title: string;
  onClose?: () => void;
  className?: string;
  children: ReactNode;
}

export function Window({ title, onClose, className = "", children }: Props) {
  return (
    <div className={`window ${className}`}>
      <div className="title-bar">
        <div>{title}</div>
        <div className="title-bar-buttons">
          {onClose && (
            <button className="title-bar-button" onClick={onClose} aria-label="Close">
              X
            </button>
          )}
        </div>
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}
