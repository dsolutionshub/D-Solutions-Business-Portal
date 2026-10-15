import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * While `when` is true: asks before leaving the page in the app ("Discard unsaved changes?")
 * and before closing or reloading the tab.
 */
export function UnsavedChangesGuard({
  when,
  message = 'What you entered will be lost.'
}: {
  when: boolean;
  message?: string;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (!when) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [when]);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={open => !open && blocker.reset?.()}
      title="Discard unsaved changes?"
      description={message}
      confirmLabel="Discard"
      onConfirm={() => blocker.proceed?.()}
    />
  );
}
