import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-border-panel px-8 py-4 flex justify-end items-center gap-6 text-xs text-text-dim font-mono">
      <a
        href="https://github.com/saemihemma/predictionmarket-OSS"
        target="_blank"
        rel="noopener noreferrer"
        className="text-text-muted no-underline transition-colors duration-200 hover:text-text"
      >
        GITHUB
      </a>
      <Link to="/disputes/help" className="text-text-muted no-underline transition-colors duration-200 hover:text-text">
        HOW DISPUTES WORK
      </Link>
    </footer>
  );
}
