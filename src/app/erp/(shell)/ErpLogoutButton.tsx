"use client";

export function ErpLogoutButton() {
  async function logout() {
    await fetch("/api/erp/auth/logout", { method: "POST" });
    window.location.href = "/erp/login";
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-left text-xs text-zinc-600 hover:border-gray-400 hover:text-zinc-900"
    >
      Sign out
    </button>
  );
}
