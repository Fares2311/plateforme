'use client';

import React from 'react';
import { AVATAR_PRESETS, getAvatarUrl } from '@/lib/avatarPresets';

interface AvatarProps {
    uid?: string;
    email?: string;
    avatarUrl?: string;
    avatarStyle?: string;
    size?: number | string;
    className?: string;
    style?: React.CSSProperties;
    onClick?: () => void;
    alt?: string;
}

export default function Avatar({
    uid,
    email,
    avatarUrl,
    avatarStyle = '1',
    size = 40,
    className = '',
    style = {},
    onClick,
    alt = 'Avatar'
}: AvatarProps) {
    let src = avatarUrl;
    const isLegacyDicebear = avatarUrl?.includes('dicebear.com/');

    if (!avatarUrl || isLegacyDicebear) {
        // Find the preset based on avatarStyle (which now acts as the preset ID)
        const preset = AVATAR_PRESETS.find(p => p.id === avatarStyle) || AVATAR_PRESETS[0];
        src = getAvatarUrl(preset.style, preset.seed);
    }

    const dimension = typeof size === 'number' ? `${size}px` : size;

    return (
        <div
            className={className}
            onClick={onClick}
            style={{
                width: dimension,
                height: dimension,
                borderRadius: '50%',
                overflow: 'hidden',
                flexShrink: 0,
                background: 'rgba(255,255,255,0.05)',
                cursor: onClick ? 'pointer' : 'default',
                ...style
            }}
        >
            <img
                src={src}
                alt={alt}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                }}
            />
        </div>
    );
}
