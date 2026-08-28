"use client";

function SignOutIcon({ className }: { className: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.75 8.25V6.5A2.25 2.25 0 0111 4.25h6a2.25 2.25 0 012.25 2.25v11A2.25 2.25 0 0117 19.75h-6a2.25 2.25 0 01-2.25-2.25v-1.75M2.5 12h11.25M10.5 8.5L14 12l-3.5 3.5" />
    </svg>
  );
}

export function ErpLogoutButton({ compact = false }: { compact?: boolean }) {
  async function logout() {
    await fetch("/api/erp/auth/logout", { method: "POST" });
    window.location.href = "/erp/login";
  }

  if (compact) {
    return (
      <div className="group relative flex justify-center">
        <button
          type="button"
          onClick={() => void logout()}
          aria-label="Sign out"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          <SignOutIcon className="h-5 w-5 shrink-0" />
        </button>
        <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          Sign out
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
    >
      <SignOutIcon className="h-5 w-5 shrink-0 text-gray-400" />
      Sign out
    </button>
  );
}
