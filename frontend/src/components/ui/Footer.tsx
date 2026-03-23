import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-border-panel">
      <div className="page-shell flex flex-col items-center justify-center gap-3 py-4 font-mono text-xs text-text-dim sm:flex-row sm:flex-wrap md:justify-end">
        <a
          href="https://github.com/saemihemma/predictionmarket-OSS"
          target="_blank"
          rel="noopener noreferrer"
          className="touch-target inline-flex items-center text-text-muted no-underline transition-colors duration-200 hover:text-text"
        >
          GITHUB
        </a>
        <Link
          to="/disputes/help"
          className="touch-target inline-flex items-center text-center text-text-muted no-underline transition-colors duration-200 hover:text-text"
        >
          HOW DISPUTES WORK
        </Link>
      </div>
    </footer>
  );
}
