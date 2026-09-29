import { plainError } from '../plainErrors';
import styles from '../ui.module.css';

/** The original provider or system text, kept one click away for support. */
function ErrorDetails({ detail }: { detail: string }) {
  return (
    <details className={styles.errorDetails}>
      <summary>Details</summary>
      <code>{detail}</code>
    </details>
  );
}

/** Title and body of a conversation notice; failures read as plain sentences. */
export function NoticeText({
  title,
  detail,
  tone,
  explained,
}: {
  title: string;
  detail: string;
  tone: 'info' | 'warning' | 'error';
  explained?: boolean | undefined;
}) {
  const plain = tone === 'error' ? plainError(detail) : undefined;
  if (!plain) {
    return (
      <>
        <strong>{title}</strong>
        {!explained ? <p>{detail}</p> : null}
      </>
    );
  }
  return (
    <>
      <strong>{plain.title}</strong>
      <p>{plain.message}</p>
      <ErrorDetails detail={detail} />
    </>
  );
}

/** Body of the Task needs attention banner. */
export function ThreadErrorText({
  error,
  explained,
}: {
  error: string;
  explained?: boolean | undefined;
}) {
  // The same failure already reads in the conversation; the banner keeps only its action.
  if (explained) return null;
  const plain = plainError(error);
  if (!plain) return <span>{error}</span>;
  return (
    <>
      <span>{plain.message}</span>
      <ErrorDetails detail={error} />
    </>
  );
}
