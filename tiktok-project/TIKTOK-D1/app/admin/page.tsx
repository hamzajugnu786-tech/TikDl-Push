'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    // Simple auth check (expand with Supabase Auth)
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
    });
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <h1 className="text-4xl font-bold mb-8">Admin Dashboard</h1>
      <div className="glass p-8 rounded-3xl">
        <p>Settings & Analytics Panel (Supabase Connected)</p>
        {/* Provider keys, ad settings, stats here */}
      </div>
    </div>
  );
}
