interface HeroBannerProps {
  readonly title: string;
  readonly description: string;
}

export function HeroBanner({ title, description }: HeroBannerProps) {
  return (
    <section
      style={{
        maxWidth: 760,
        padding: '3rem',
        border: '1px solid #d9d9d2',
        borderRadius: 24,
        background: '#ffffff',
        boxShadow: '0 16px 50px rgb(0 0 0 / 8%)',
      }}
    >
      <p style={{ margin: 0, fontWeight: 700, letterSpacing: '0.08em' }}>
        SteadyStack
      </p>
      <h1
        style={{ marginBottom: '0.75rem', fontSize: 'clamp(2rem, 7vw, 4rem)' }}
      >
        {title}
      </h1>
      <p style={{ margin: 0, fontSize: '1.125rem', lineHeight: 1.6 }}>
        {description}
      </p>
    </section>
  );
}
