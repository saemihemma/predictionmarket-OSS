/** Uppercase muted label divider — separates sections within a panel */
export default function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "IBM Plex Mono",
        fontSize: "0.6rem",
        fontWeight: 500,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--text-dim)",
        paddingBottom: "0.4rem",
        marginBottom: "0.5rem",
        borderBottom: "1px solid var(--border-grid)",
      }}
    >
      {children}
    </div>
  );
}
