export function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h2 id={id} className="mt-8 text-lg font-semibold text-gray-900 scroll-mt-6 first:mt-0">{children}</h2>;
}

export function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h3 id={id} className="mt-6 text-base font-semibold text-gray-900 scroll-mt-6">{children}</h3>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-gray-700">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mt-3 space-y-1.5 pl-5 text-sm text-gray-700 list-disc">{children}</ul>;
}

export function LI({ children }: { children: React.ReactNode }) {
  return <li className="leading-relaxed">{children}</li>;
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className="font-medium text-pink-600 hover:text-pink-500 hover:underline"
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  );
}

export function Img({ src, alt, size = "full" }: { src: string; alt?: string; size?: "full" | "sm" }) {
  const width = size === "sm" ? "max-w-xs w-full" : "w-full";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt ?? ""} className={`my-4 ${width} rounded-xl border border-gray-200 shadow-sm`} />;
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-gray-50">{children}</thead>;
}

export function TH({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</th>;
}

export function TD({ children }: { children: React.ReactNode }) {
  return <td className="border-t border-gray-100 px-4 py-2.5 text-gray-700">{children}</td>;
}

export function HR() {
  return <hr className="my-6 border-gray-200" />;
}

export function Callout({
  type = "info",
  children,
}: {
  type?: "info" | "warning" | "tip";
  children: React.ReactNode;
}) {
  const styles = {
    info: {
      wrapper: "bg-blue-50 border-blue-200 text-blue-900",
      icon: (
        <svg className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
        </svg>
      ),
    },
    warning: {
      wrapper: "bg-amber-50 border-amber-200 text-amber-900",
      icon: (
        <svg className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      ),
    },
    tip: {
      wrapper: "bg-green-50 border-green-200 text-green-900",
      icon: (
        <svg className="h-4 w-4 shrink-0 text-green-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  };

  const s = styles[type];
  return (
    <div className={`my-4 flex gap-3 rounded-lg border px-4 py-3 text-sm ${s.wrapper}`}>
      {s.icon}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function Steps({ children }: { children: React.ReactNode }) {
  return <div className="my-6 flex flex-col gap-4">{children}</div>;
}

export function Step({ n: _, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-pink-200 pl-4">
      <p className="font-semibold text-pink-600">{title}</p>
      <div className="mt-1 text-sm text-gray-600 leading-relaxed">{children}</div>
    </div>
  );
}

export function SkipTo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-sm font-medium text-pink-600 hover:text-pink-500 hover:underline">
      {children}
    </a>
  );
}

export function Embed({ src, title, aspect = "16/9" }: { src: string; title: string; aspect?: "16/9" | "4/3" | "1/1" }) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 shadow-sm" style={{ aspectRatio: aspect }}>
      <iframe src={src} title={title} className="h-full w-full" allowFullScreen allow="autoplay" />
    </div>
  );
}
