"use client";

type FloatingAddButtonProps = {
  onClick: () => void;
  /** Hide while a modal/dialog is open so the FAB stays behind overlays. */
  hidden?: boolean;
  label?: string;
  ariaLabel?: string;
};

/**
 * Fixed bottom-right FAB: a brand-filled circle with “+” (accessible name via
 * `ariaLabel`). Carries the same fill as every other primary action, so the
 * page's one affirmative control reads the same whether it's docked in a form
 * footer or floating over a list.
 */
export function FloatingAddButton({
  onClick,
  hidden,
  label = "+",
  ariaLabel = "Add",
}: FloatingAddButtonProps) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-40 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-2xl font-semibold leading-none text-brand-on shadow-lg transition-colors duration-150 hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 sm:bottom-8 sm:right-8"
    >
      {label}
    </button>
  );
}
