'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '@/i18n/translations';

type Language = 'fr' | 'en';

interface LocaleContextType {
    locale: Language;
    setLocale: (lang: Language) => void;
    t: (key: string) => string;
}

const LocaleContext = createContext<LocaleContextType>({
    locale: 'fr',
    setLocale: () => { },
    t: (key) => key
});

export const LocaleProvider = ({ children }: { children: React.ReactNode }) => {
    const [locale, setLocaleState] = useState<Language>('fr');

    useEffect(() => {
        // Load from local storage
        const stored = localStorage.getItem('gitsync_lang') as Language;
        if (stored && (stored === 'fr' || stored === 'en')) {
            setLocaleState(stored);
        }
    }, []);

    const setLocale = (lang: Language) => {
        localStorage.setItem('gitsync_lang', lang);
        setLocaleState(lang);
    };

    const t = (key: string): string => {
        const translation = translations[locale] as any;
        return translation[key] || key;
    };

    return (
        <LocaleContext.Provider value={{ locale, setLocale, t }}>
            {children}
        </LocaleContext.Provider>
    );
};

export const useLocale = () => useContext(LocaleContext);
