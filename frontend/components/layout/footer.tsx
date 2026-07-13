import { Shield, FileText, Mail } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-slate-200/80 bg-white/80">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-8 text-[13px] text-slate-600 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 FLUID. Intelligent coordination for life-saving blood donation.</p>
          <p>Modern healthcare SaaS experience • Privacy-first roadmap</p>
        </div>
        <div className="flex items-center gap-4 border-t border-slate-200/50 pt-4">
          <a href="#privacy" className="group flex items-center gap-1.5 text-slate-600 transition duration-200 hover:text-slate-900">
            <Shield className="h-4 w-4 text-slate-400 transition duration-200 group-hover:scale-110" />
            Privacy
          </a>
          <a href="#terms" className="group flex items-center gap-1.5 text-slate-600 transition duration-200 hover:text-slate-900">
            <FileText className="h-4 w-4 text-slate-400 transition duration-200 group-hover:scale-110" />
            Terms
          </a>
          <a href="mailto:hello@fluid.health" className="group flex items-center gap-1.5 text-slate-600 transition duration-200 hover:text-slate-900">
            <Mail className="h-4 w-4 text-slate-400 transition duration-200 group-hover:scale-110" />
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
