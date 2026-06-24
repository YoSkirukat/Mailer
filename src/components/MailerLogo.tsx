interface MailerLogoProps {
  className?: string;
}

export function MailerLogo({ className }: MailerLogoProps) {
  return (
    <div
      className={`mailer-logo ${className ?? ""}`.trim()}
      aria-label="Почта"
    >
      <span className="mailer-logo-text">Почта</span>
    </div>
  );
}
