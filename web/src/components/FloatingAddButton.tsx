"use client";

type FloatingAddButtonProps = {
  onClick: () => void;
  /** Hide while a modal/dialog is open so the FAB stays behind overlays. */
  hidden?: boolean;
  label?: string;
  ariaLabel?: string;
};

/**
 * Fixed bottom-right FAB: red circle with “+” (accessibility via ariaLabel).
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
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-40 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-red-600 text-2xl font-semibold leading-none text-white shadow-lg ring-1 ring-black/10 transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 dark:bg-red-600 dark:ring-white/10 dark:hover:bg-red-500 dark:focus:ring-offset-black sm:bottom-8 sm:right-8"
    >
      {label}
    </button>
  );
}
