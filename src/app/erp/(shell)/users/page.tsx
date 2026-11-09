import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageUsers, isPmLevel } from "@/lib/erpAuth";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { loadPmPortalUsers, loadSubPortalUsers } from "@/lib/erp/portalUsers";
import { UsersTable } from "./UsersTable";
import { PortalUsersTable } from "./PortalUsersTable";

export const dynamic = "force-dynamic";

/**
 * Staff (ERP roles, Admin only), Subs and Property managers (their private
 * pages, PM / Business Manager / Admin). Without the Staff tab, PMs and
 * Business Managers open straight onto Subs.
 */
export default async function UsersPage() {
  const auth = await getErpAuth();
  if (!auth || !isPmLevel(auth.role)) notFound();
  const isAdmin = canManageUsers(auth.role);

  const [users, callerRecord, subs, pms] = await Promise.all([
    isAdmin
      ? prisma.erpUser.findMany({
          orderBy: { createdAt: "asc" },
          select: { id: true, email: true, role: true, createdAt: true },
        })
      : [],
    isAdmin ? prisma.erpUser.findUnique({ where: { firebaseUid: auth.uid }, select: { id: true } }) : null,
    loadSubPortalUsers(),
    loadPmPortalUsers(),
  ]);

  const tabs = [
    ...(isAdmin
      ? [
          {
            label: "Staff",
            content: (
              <UsersTable users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))} currentUserId={callerRecord?.id ?? ""} />
            ),
          },
        ]
      : []),
    { label: "Subs", content: <PortalUsersTable kind="sub" rows={subs} /> },
    { label: "Property managers", content: <PortalUsersTable kind="pm" rows={pms} /> },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
      <DetailTabs tabs={tabs} />
    </div>
  );
}
