import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageUsers } from "@/lib/erpAuth";
import { UsersTable } from "./UsersTable";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageUsers(auth.role)) notFound();

  const [users, callerRecord] = await Promise.all([
    prisma.erpUser.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, role: true, createdAt: true },
    }),
    prisma.erpUser.findUnique({ where: { firebaseUid: auth.uid }, select: { id: true } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-pink-600">User Management</h1>
        <p className="mt-1 text-sm text-gray-500">Manage ERP user roles. Users are created automatically on first login.</p>
      </div>
      <UsersTable
        users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        currentUserId={callerRecord?.id ?? ""}
      />
    </div>
  );
}
