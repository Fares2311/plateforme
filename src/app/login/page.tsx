'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { useLocale } from '@/context/LocaleContext';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();
    const { t } = useLocale();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, email, password);
            router.push('/dashboard');
        } catch (err: any) {
            setError(err.message || t('login_error'));
        }
    };

    return (
        <div className="container py-16 flex justify-center items-center" style={{ minHeight: 'calc(100vh - 4.5rem)' }}>
            <div className="card glass-panel fade-enter" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
                <div className="text-center mb-8">
                    <div className="mx-auto flex flex-col items-center justify-center mb-4" style={{ width: '4rem', height: '4rem', borderRadius: '1rem', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary)' }}>
                        <LogIn size={32} />
                    </div>
                    <h2>{t('login_title')}</h2>
                </div>

                {error && <div style={{ color: 'var(--color-danger)', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label>{t('login_label_email')}</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" required />
                    </div>
                    <div className="form-group">
                        <label>{t('login_label_password')}</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" required />
                    </div>
                    <button type="submit" className="btn btn-primary w-full mt-8" style={{ justifyContent: 'center' }}>{t('login_btn_submit')}</button>
                </form>
                <p className="text-center text-sm mt-8">{t('login_no_account')} <Link href="/register" className="text-primary font-bold">{t('login_register_link')}</Link></p>
            </div>
        </div>
    );
}
