export const AVATAR_PRESETS = [
    { id: '1', style: 'avataaars', seed: 'Oliver' },
    { id: '2', style: 'bottts', seed: 'Felix' },
    { id: '3', style: 'micah', seed: 'Sam' },
    { id: '4', style: 'fun-emoji', seed: 'Happy' },
    { id: '5', style: 'lorelei', seed: 'Mia' },
    { id: '6', style: 'adventurer', seed: 'Leo' },
    { id: '7', style: 'croodles', seed: 'Zoe' },
    { id: '8', style: 'pixel-art', seed: 'Max' },
    { id: '9', style: 'shapes', seed: 'Hex' },
    { id: '10', style: 'identicon', seed: 'User10' },
    { id: '11', style: 'rings', seed: 'Orbit' },
    { id: '12', style: 'thumbs', seed: 'Good' },
    { id: '13', style: 'avataaars', seed: 'Sophia' },
    { id: '14', style: 'bottts', seed: 'Spark' },
    { id: '15', style: 'micah', seed: 'Alex' },
    { id: '16', style: 'lorelei', seed: 'Luna' },
    { id: '17', style: 'adventurer', seed: 'Finn' },
    { id: '18', style: 'croodles', seed: 'Noah' },
    { id: '19', style: 'pixel-art', seed: 'Bit' },
    { id: '20', style: 'fun-emoji', seed: 'Cool' },
];

export const getAvatarUrl = (style: string, seed: string) => {
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
};
