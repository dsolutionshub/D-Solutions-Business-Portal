import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { RequirePermission } from '@/app/RequirePermission';
import { blankCompose } from '../compose';
import { ComposeForm } from '../components/ComposeForm';
import { EmailLayout } from '../components/EmailLayout';

/** Email Center → Compose. ?client= preselects a client; ?template= applies a template. */
export function ComposePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const client = params.get('client') ?? '';
  const initial = useMemo(() => blankCompose(client), [client]);
  return (
    <RequirePermission permission="emails.send">
      <EmailLayout>
        <div className="max-w-4xl p-5">
          <ComposeForm
            initial={initial}
            templateToApply={params.get('template')}
            onSent={() => navigate('/email')}
          />
        </div>
      </EmailLayout>
    </RequirePermission>
  );
}
