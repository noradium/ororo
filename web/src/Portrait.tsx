import type { CatId } from './model';
export function Portrait({ cat }: { cat: CatId }) {
  const grey = cat === 'MONET';
  return (
    <svg className="portrait" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill={grey ? '#d9e1e8' : '#ede3d0'} />
      <g fill={grey ? '#95a2b1' : '#fffcf3'}>
        <path d="M21 44 19 13 43 32H57L81 13 79 44Z" />
        {!grey &&
          Array.from({ length: 12 }, (_, i) => (
            <circle
              key={i}
              cx={50 + Math.cos((i * Math.PI) / 6) * 27}
              cy={55 + Math.sin((i * Math.PI) / 6) * 25}
              r="12"
            />
          ))}
        <ellipse cx="50" cy="55" rx="33" ry="29" />
      </g>
      <path d="M25 31 25 23 35 32M65 32 75 23 75 31" fill="#d4aeb0" />
      <g fill={grey ? '#dfbb73' : '#9fbeba'}>
        <circle cx="35" cy="52" r="6" />
        <circle cx="65" cy="52" r="6" />
      </g>
      <g fill="#354b43">
        <ellipse cx="35" cy="52" rx="2" ry="4" />
        <ellipse cx="65" cy="52" rx="2" ry="4" />
      </g>
      <path d="m46 64 8 0-4 5z" fill="#b58d91" />
      <path
        d="M50 69v4m-27-9 16 3m-16 4 16-1m22-3 16-3m-16 6 16 1"
        stroke="#68776e"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
