'use client';

import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect via useEffect
  }

  const handleLogout = async () => {
    try {
      if (!auth) return;
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <main className="bg-white text-gray-900 min-h-screen">
      <nav className="border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#E73C6E]">Sueep Dashboard</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-5 py-10">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-4">Welcome!</h2>
          <p className="text-lg text-gray-600 mb-6">
            Logged in as: <span className="font-semibold text-gray-900">{user.email}</span>
          </p>
          
          <div className="space-y-4">
            <div className="bg-white p-4 rounded border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">Account Info</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>
                  <span className="font-medium">Email:</span> {user.email}
                </li>
                <li>
                  <span className="font-medium">UID:</span> {user.uid}
                </li>
                <li>
                  <span className="font-medium">Email Verified:</span>{' '}
                  {user.emailVerified ? 'Yes' : 'No'}
                </li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <p className="text-sm text-blue-900">
                 You are logged in and can access this protected page from any device using your email and password.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
