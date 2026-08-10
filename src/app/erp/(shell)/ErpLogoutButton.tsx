"use client";

function SignOutIcon({ className }: { className: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.75 8.25V6.5A2.25 2.25 0 0111 4.25h6a2.25 2.25 0 012.25 2.25v11A2.25 2.25 0 0117 19.75h-6a2.25 2.25 0 01-2.25-2.25v-1.75M2.5 12h11.25M10.5 8.5L14 12l-3.5 3.5" />
    </svg>
  );
}

export function ErpLogoutButton() {
  async function logout() {
    await fetch("/api/erp/auth/logout", { method: "POST" });
    window.location.href = "/erp/login";
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
